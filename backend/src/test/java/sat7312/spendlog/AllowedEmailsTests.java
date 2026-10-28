package sat7312.spendlog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:spendlog-allowed",
        "app.auth.allowed-emails=Alice@Example.com, bob@example.com",
        "app.google.client-id=test-client"})
@AutoConfigureMockMvc
class AllowedEmailsTests {
    @Autowired
    MockMvc mvc;

    @Autowired
    JwtEncoder encoder;

    private String token(String email) {
        Instant now = Instant.now();
        return token(encoder, email, now, now.plusSeconds(60));
    }

    private static String token(JwtEncoder encoder, String email, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(email).issuedAt(issuedAt)
                .expiresAt(expiresAt).claim("email", email).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    @Test
    void parsesListCaseInsensitively() {
        var allowed = new AllowedEmails("Alice@Example.com, bob@example.com");
        assertThat(allowed.allows("alice@example.com")).isTrue();
        assertThat(allowed.allows("BOB@example.com")).isTrue();
        assertThat(allowed.allows("eve@example.com")).isFalse();
        assertThat(allowed.allows(null)).isFalse();
        assertThat(new AllowedEmails("").allows("anyone@example.com")).isTrue();
    }

    @Test
    void blocksIssuedTokensOfAccountsNotInList() throws Exception {
        mvc.perform(get("/api/data").header("Authorization", "Bearer " + token("alice@example.com")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/data").header("Authorization", "Bearer " + token("eve@example.com")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void stillRejectsForgedGoogleCredential() throws Exception {
        mvc.perform(post("/api/auth/google").contentType(MediaType.APPLICATION_JSON).content("{\"credential\":\"bogus\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void acceptsOnlyValidBearerTokens() throws Exception {
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + token("alice@example.com")))
                .andExpect(status().isOk());

        // 기본 시각 검증은 60초 허용 오차가 있으므로 5분 전에 만료된 토큰을 씁니다.
        Instant now = Instant.now();
        String expired = token(encoder, "alice@example.com", now.minusSeconds(600), now.minusSeconds(300));
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + expired))
                .andExpect(status().isUnauthorized());

        // 서버 키가 아닌 다른 32바이트 키로 서명한 토큰은 거부합니다.
        var otherKey = new SecretKeySpec("another-secret-key-for-forged-tokens!".getBytes(StandardCharsets.UTF_8),
                "HmacSHA256");
        String forged = token(new NimbusJwtEncoder(new ImmutableSecret<>(otherKey)), "alice@example.com",
                now, now.plusSeconds(60));
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + forged))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/data").header("Authorization", "Bearer " + forged))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/me").header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized());
    }
}
