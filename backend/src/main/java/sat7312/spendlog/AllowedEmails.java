package sat7312.spendlog;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** ALLOWED_EMAILS에 적힌 계정만 쓰게 합니다. 비어 있으면 모든 Google 계정을 허용합니다. */
@Component
public class AllowedEmails {
    private final Set<String> emails;

    public AllowedEmails(@Value("${app.auth.allowed-emails:}") String value) {
        emails = Arrays.stream(value.split("[,;\\s]+"))
                .map(email -> email.trim().toLowerCase(Locale.ROOT))
                .filter(email -> !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean allows(String email) {
        return emails.isEmpty() || (email != null && emails.contains(email.toLowerCase(Locale.ROOT)));
    }
}
