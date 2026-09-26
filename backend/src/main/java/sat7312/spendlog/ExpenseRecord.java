package sat7312.spendlog;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;

@Entity
@Table(name = "expense_records")
public class ExpenseRecord {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    private String name;
    private long amount;
    private LocalDate date;

    protected ExpenseRecord() {}

    public ExpenseRecord(String id, Category category, String name, long amount, LocalDate date) {
        this.id = id;
        update(category, name, amount, date);
    }

    public void update(Category category, String name, long amount, LocalDate date) {
        this.category = category;
        this.name = name;
        this.amount = amount;
        this.date = date;
    }

    public String getId() { return id; }
    public Category getCategory() { return category; }
    public String getName() { return name; }
    public long getAmount() { return amount; }
    public LocalDate getDate() { return date; }
}
