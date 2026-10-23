package sat7312.spendlog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryRepository extends JpaRepository<Category, String> {
    List<Category> findByOwnerId(String ownerId);
    Optional<Category> findByIdAndOwnerId(String id, String ownerId);
    void deleteByOwnerId(String ownerId);
}
