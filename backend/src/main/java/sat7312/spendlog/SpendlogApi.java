package sat7312.spendlog;

import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
    private static final LocalDate MIN_DATE = LocalDate.of(2000, 1, 1);
    private static final String DUPLICATE_CATEGORY_NAME = "이미 있는 카테고리 이름입니다";
    private final CategoryRepository categories;
    private final ExpenseRecordRepository records;
    private final Clock clock;

    public SpendlogApi(CategoryRepository categories, ExpenseRecordRepository records, Clock clock) {
        this.categories = categories;
        this.records = records;
        this.clock = clock;
    }

    public record CategoryData(String id, String name, String icon) {}
    public record RecordData(String id, String category, String name, long amount, LocalDate date) {}
    public record Data(List<CategoryData> categories, List<RecordData> records) {}
    public record CategoryInput(String name, String icon) {}
    public record RecordInput(String category, String name, long amount, LocalDate date) {}

    @GetMapping("/data")
    @Transactional(readOnly = true)
    public Data data(@AuthenticationPrincipal Jwt user) {
        return data(user.getSubject());
    }

    private Data data(String owner) {
        return new Data(categories.findByOwnerId(owner).stream().map(this::toData).toList(),
                records.findByOwnerId(owner).stream().map(this::toData).toList());
    }

    @PostMapping("/categories")
    public CategoryData addCategory(@AuthenticationPrincipal Jwt user, @RequestBody CategoryInput input) {
        String name = required(input.name(), "카테고리 이름");
        String icon = icon(input.icon());
        requireUniqueCategoryName(user.getSubject(), name, null);
        return toData(categories.save(new Category(UUID.randomUUID().toString(), user.getSubject(), name, icon)));
    }

    /** 이름과 아이콘만 바꾸므로 ID가 유지되어 기록은 그대로 남습니다. */
    @PutMapping("/categories/{id}")
    public CategoryData updateCategory(@AuthenticationPrincipal Jwt user, @PathVariable String id,
            @RequestBody CategoryInput input) {
        Category category = category(user, id);
        String name = required(input.name(), "카테고리 이름");
        String icon = icon(input.icon());
        requireUniqueCategoryName(user.getSubject(), name, category.getId());
        category.update(name, icon);
        return toData(categories.save(category));
    }

    @DeleteMapping("/categories/{id}")
    @Transactional
    public void deleteCategory(@AuthenticationPrincipal Jwt user, @PathVariable String id) {
        Category category = category(user, id);
        records.deleteByCategoryId(category.getId());
        categories.delete(category);
    }

    @PostMapping("/records")
    public RecordData addRecord(@AuthenticationPrincipal Jwt user, @RequestBody RecordInput input) {
        return toData(records.save(new ExpenseRecord(UUID.randomUUID().toString(), category(user, input.category()),
                required(input.name(), "항목명"), amount(input.amount()), date(input.date()))));
    }

    @PutMapping("/records/{id}")
    public RecordData updateRecord(@AuthenticationPrincipal Jwt user, @PathVariable String id,
            @RequestBody RecordInput input) {
        ExpenseRecord record = records.findByIdAndOwnerId(id, user.getSubject()).orElseThrow(() -> notFound("기록"));
        record.update(category(user, input.category()), required(input.name(), "항목명"),
                amount(input.amount()), date(input.date()));
        return toData(records.save(record));
    }

    @DeleteMapping("/records/{id}")
    public void deleteRecord(@AuthenticationPrincipal Jwt user, @PathVariable String id) {
        records.delete(records.findByIdAndOwnerId(id, user.getSubject()).orElseThrow(() -> notFound("기록")));
    }

    /** 백업의 ID는 다른 사용자와 겹칠 수 있으므로 카테고리와 기록 ID를 새로 발급합니다. */
    @PutMapping("/data")
    @Transactional
    public Data restore(@AuthenticationPrincipal Jwt user, @RequestBody Data input) {
        if (input == null || input.categories() == null || input.records() == null) {
            throw badRequest("올바른 백업 파일이 아닙니다");
        }
        String owner = user.getSubject();
        var byBackupId = new HashMap<String, Category>();
        var names = new HashSet<String>();
        for (CategoryData c : input.categories()) {
            if (c == null) throw badRequest("올바른 카테고리 데이터가 아닙니다");
            String backupId = required(c.id(), "카테고리 ID");
            var category = new Category(UUID.randomUUID().toString(), owner,
                    required(c.name(), "카테고리 이름"), icon(c.icon()));
            if (byBackupId.putIfAbsent(backupId, category) != null) throw badRequest("카테고리 ID가 중복되었습니다");
            if (!names.add(categoryNameKey(category.getName()))) throw badRequest(DUPLICATE_CATEGORY_NAME);
        }
        var newRecords = input.records().stream().map(r -> {
            if (r == null) throw badRequest("올바른 기록 데이터가 아닙니다");
            Category category = byBackupId.get(r.category());
            if (category == null) throw badRequest("기록의 카테고리를 찾을 수 없습니다");
            return new ExpenseRecord(UUID.randomUUID().toString(), category, required(r.name(), "항목명"),
                    amount(r.amount()), date(r.date()));
        }).toList();
        records.deleteByOwnerId(owner);
        categories.deleteByOwnerId(owner);
        records.flush();
        categories.saveAll(byBackupId.values());
        records.saveAll(newRecords);
        return data(owner);
    }

    private CategoryData toData(Category c) {
        return new CategoryData(c.getId(), c.getName(), c.getIcon());
    }

    private RecordData toData(ExpenseRecord r) {
        return new RecordData(r.getId(), r.getCategory().getId(), r.getName(), r.getAmount(), r.getDate());
    }

    private Category category(Jwt user, String id) {
        if (id == null) throw notFound("카테고리");
        return categories.findByIdAndOwnerId(id, user.getSubject()).orElseThrow(() -> notFound("카테고리"));
    }

    private String required(String value, String label) {
        if (value == null || value.isBlank() || value.length() > 120) {
            throw badRequest(label + "을(를) 1~120자로 입력해 주세요");
        }
        return value.trim();
    }

    /** 같은 사용자의 카테고리 중 excludedId를 제외하고 이름이 겹치면 거부합니다. */
    private void requireUniqueCategoryName(String owner, String name, String excludedId) {
        String key = categoryNameKey(name);
        boolean duplicated = categories.findByOwnerId(owner).stream()
                .filter(c -> !c.getId().equals(excludedId))
                .anyMatch(c -> categoryNameKey(c.getName()).equals(key));
        if (duplicated) throw badRequest(DUPLICATE_CATEGORY_NAME);
    }

    /** 카테고리 이름은 앞뒤 공백을 제거하고 대소문자를 구분하지 않고 비교합니다. */
    private static String categoryNameKey(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
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
        if (value.isBefore(MIN_DATE) || value.isAfter(LocalDate.now(clock))) {
            throw badRequest("날짜는 2000-01-01부터 오늘까지 입력해 주세요");
        }
        return value;
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private ResponseStatusException notFound(String label) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, label + "을(를) 찾을 수 없습니다");
    }
}
