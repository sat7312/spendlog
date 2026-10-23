package sat7312.spendlog;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class AuthApi {
    private static final Set<String> GOOGLE_ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");
    private static final Duration TOKEN_LIFETIME = Duration.ofDays(7);
    private final AppUserRepository users;
    private final AllowedEmails allowedEmails;
    private final JwtEncoder encoder;
    private final String clientId;
    private final NimbusJwtDecoder googleDecoder;

    public AuthApi(AppUserRepository users, AllowedEmails allowedEmails, JwtEncoder encoder,
            @Value("${app.google.client-id:}") String clientId) {
        this.users = users;
        this.allowedEmails = allowedEmails;
        this.encoder = encoder;
        this.clientId = clientId;
        googleDecoder = NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        googleDecoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(),
                jwt -> GOOGLE_ISSUERS.contains(jwt.getClaimAsString("iss")) ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "발급자가 Google이 아닙니다", null)),
                jwt -> jwt.getAudience() != null && jwt.getAudience().contains(clientId) ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "다른 앱의 토큰입니다", null))));
    }

    public record GoogleLogin(String credential) {}
    public record UserData(String email, String name) {}
    public record LoginResult(String token, UserData user) {}

    @PostMapping("/auth/google")
    @Transactional
    public LoginResult google(@RequestBody GoogleLogin input) {
        if (clientId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "서버에 GOOGLE_CLIENT_ID가 설정되지 않았습니다");
        }
        if (input == null || input.credential() == null || input.credential().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google 로그인 정보가 없습니다");
        }
        Jwt google;
        try {
            google = googleDecoder.decode(input.credential());
        } catch (JwtException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google 로그인을 확인하지 못했습니다");
        }
        String id = google.getSubject();
        String email = google.getClaimAsString("email");
        String name = google.getClaimAsString("name");
        if (!Boolean.TRUE.equals(google.getClaimAsBoolean("email_verified")) || !allowedEmails.allows(email)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "허용되지 않은 계정입니다");
        }
        AppUser user = users.findById(id).orElseGet(() -> new AppUser(id, email, name));
        user.update(email, name);
        users.save(user);

        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(id)
                .issuedAt(now)
                .expiresAt(now.plus(TOKEN_LIFETIME))
                .claim("email", email == null ? "" : email)
                .claim("name", name == null ? "" : name)
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new LoginResult(token, new UserData(email, name));
    }

    @GetMapping("/me")
    public UserData me(@AuthenticationPrincipal Jwt jwt) {
        return new UserData(jwt.getClaimAsString("email"), jwt.getClaimAsString("name"));
    }
}
