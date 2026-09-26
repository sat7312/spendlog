package sat7312.spendlog;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class SpendlogApi {
    private static final List<String> ICONS = List.of(
            "ti-device-gamepad-2", "ti-palette", "ti-plane", "ti-music", "ti-book", "ti-camera",
            "ti-run", "ti-trophy", "ti-pizza", "ti-shirt", "ti-ball-football", "ti-headphones");
    private final CategoryRepository categories;
    private final ExpenseRecordRepository records;

    public SpendlogApi(CategoryRepository categories, ExpenseRecordRepository records) {
        this.categories = categories;
        this.records = records;
    }

    public record CategoryData(String id, String name, String icon) {}
    public record RecordData(String id, String category, String name, long amount, LocalDate date) {}
    public record Data(List<CategoryData> categories, List<RecordData> records) {}
    public record CategoryInput(String name, String icon) {}
    public record RecordInput(String category, String name, long amount, LocalDate date) {}

    @GetMapping("/data")
    @Transactional(readOnly = true)
    public Data data() {
        return new Data(categories.findAll().stream().map(this::toData).toList(),
                records.findAll().stream().map(this::toData).toList());
    }

    @PostMapping("/categories")
    public CategoryData addCategory(@RequestBody CategoryInput input) {
        String name = required(input.name(), "카테고리 이름");
        String icon = icon(input.icon());
        return toData(categories.save(new Category(UUID.randomUUID().toString(), name, icon)));
    }

    @DeleteMapping("/categories/{id}")
    @Transactional
    public void deleteCategory(@PathVariable String id) {
        Category category = category(id);
        records.deleteByCategoryId(category.getId());
        categories.delete(category);
    }

    @PostMapping("/records")
    public RecordData addRecord(@RequestBody RecordInput input) {
        return toData(records.save(new ExpenseRecord(UUID.randomUUID().toString(), category(input.category()),
                required(input.name(), "항목명"), amount(input.amount()), date(input.date()))));
    }

    @PutMapping("/records/{id}")
    public RecordData updateRecord(@PathVariable String id, @RequestBody RecordInput input) {
        ExpenseRecord record = records.findById(id).orElseThrow(() -> notFound("기록"));
        record.update(category(input.category()), required(input.name(), "항목명"),
                amount(input.amount()), date(input.date()));
        return toData(records.save(record));
    }

    @DeleteMapping("/records/{id}")
    public void deleteRecord(@PathVariable String id) {
        if (!records.existsById(id)) throw notFound("기록");
        records.deleteById(id);
    }

    @PutMapping("/data")
    @Transactional
    public Data restore(@RequestBody Data input) {
        if (input == null || input.categories() == null || input.records() == null) {
            throw badRequest("올바른 백업 파일이 아닙니다");
        }
        var ids = new HashSet<String>();
        var newCategories = input.categories().stream().map(c -> {
            if (c == null) throw badRequest("올바른 카테고리 데이터가 아닙니다");
            String id = required(c.id(), "카테고리 ID");
            if (!ids.add(id)) throw badRequest("카테고리 ID가 중복되었습니다");
            return new Category(id, required(c.name(), "카테고리 이름"), icon(c.icon()));
        }).toList();
        Map<String, Category> byId = newCategories.stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        ids.clear();
        var newRecords = input.records().stream().map(r -> {
            if (r == null) throw badRequest("올바른 기록 데이터가 아닙니다");
            String id = required(r.id(), "기록 ID");
            if (!ids.add(id)) throw badRequest("기록 ID가 중복되었습니다");
            Category category = byId.get(r.category());
            if (category == null) throw badRequest("기록의 카테고리를 찾을 수 없습니다");
            return new ExpenseRecord(id, category, required(r.name(), "항목명"),
                    amount(r.amount()), date(r.date()));
        }).toList();
        records.deleteAllInBatch();
        categories.deleteAllInBatch();
        categories.saveAll(newCategories);
        records.saveAll(newRecords);
        return data();
    }

    private CategoryData toData(Category c) {
        return new CategoryData(c.getId(), c.getName(), c.getIcon());
    }

    private RecordData toData(ExpenseRecord r) {
        return new RecordData(r.getId(), r.getCategory().getId(), r.getName(), r.getAmount(), r.getDate());
    }

    private Category category(String id) {
        return categories.findById(id).orElseThrow(() -> notFound("카테고리"));
    }

    private String required(String value, String label) {
        if (value == null || value.isBlank() || value.length() > 120) {
            throw badRequest(label + "을(를) 1~120자로 입력해 주세요");
        }
        return value.trim();
    }

    private String icon(String value) {
        if (!ICONS.contains(value)) throw badRequest("지원하지 않는 아이콘입니다");
        return value;
    }

    private long amount(long value) {
        if (value <= 0) throw badRequest("금액은 0보다 커야 합니다");
        return value;
    }

    private LocalDate date(LocalDate value) {
        if (value == null) throw badRequest("날짜를 입력해 주세요");
        return value;
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException notFound(String label) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, label + "을(를) 찾을 수 없습니다");
    }
}
