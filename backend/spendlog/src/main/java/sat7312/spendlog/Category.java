package sat7312.spendlog;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
public class Category {
    @Id
    private String id;
    private String name;
    private String icon;

    protected Category() {}

    public Category(String id, String name, String icon) {
        this.id = id;
        this.name = name;
        this.icon = icon;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getIcon() { return icon; }
}
