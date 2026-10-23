package sat7312.spendlog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRecordRepository extends JpaRepository<ExpenseRecord, String> {
    List<ExpenseRecord> findByOwnerId(String ownerId);
    Optional<ExpenseRecord> findByIdAndOwnerId(String id, String ownerId);
    void deleteByCategoryId(String categoryId);
    void deleteByOwnerId(String ownerId);
}
