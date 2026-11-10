package sat7312.spendlog;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRecordRepository extends JpaRepository<ExpenseRecord, String> {
    void deleteByCategoryId(String categoryId);
}
