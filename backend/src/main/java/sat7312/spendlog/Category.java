package sat7312.spendlog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
public class Category {
    @Id
    private String id;
    @Column(name = "owner_id")
    private String ownerId;
    private String name;
    private String icon;

    protected Category() {}

    public Category(String id, String ownerId, String name, String icon) {
        this.id = id;
        this.ownerId = ownerId;
        this.name = name;
        this.icon = icon;
    }

    public void update(String name, String icon) {
        this.name = name;
        this.icon = icon;
    }

    public String getId() { return id; }
    public String getOwnerId() { return ownerId; }
    public String getName() { return name; }
    public String getIcon() { return icon; }
}
