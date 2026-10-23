package sat7312.spendlog;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class AppUser {
    /** Google 계정의 sub 값입니다. */
    @Id
    private String id;
    private String email;
    private String name;

    protected AppUser() {}

    public AppUser(String id, String email, String name) {
        this.id = id;
        update(email, name);
    }

    public void update(String email, String name) {
        this.email = email;
        this.name = name;
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public String getName() { return name; }
}
