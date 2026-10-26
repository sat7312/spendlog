package sat7312.spendlog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:spendlog-test")
@AutoConfigureMockMvc
class SpendlogApplicationTests {
    private static final String BACKUP = """
            {"categories":[{"id":"games","name":"게임","icon":"ti-device-gamepad-2"}],
             "records":[{"id":"r1","category":"games","name":"스팀","amount":52000,"date":"2026-06-02"}]}
            """;

    private static final String DATE_RANGE_ERROR = "날짜는 2000-01-01부터 오늘까지 입력해 주세요";
    private static final String DATE_REQUIRED_ERROR = "날짜를 입력해 주세요";

    /** UTC로는 2026-06-01이지만 서울 기준으로는 2026-06-02인 시각으로 '오늘'을 고정합니다. */
    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(Instant.parse("2026-06-01T15:30:00Z"), ZoneId.of("Asia/Seoul"));
        }
    }

    @Autowired
    MockMvc mvc;

    private static RequestPostProcessor user(String id) {
        return jwt().jwt(token -> token.subject(id));
    }

    @Test
    void rejectsRequestsWithoutLogin() throws Exception {
        mvc.perform(get("/api/data")).andExpect(status().isUnauthorized());
    }

    @Test
    void keepsEachUsersDataSeparate() throws Exception {
        mvc.perform(put("/api/data").with(user("alice")).contentType(MediaType.APPLICATION_JSON).content(BACKUP))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories", hasSize(1)))
                .andExpect(jsonPath("$.records", hasSize(1)));
        // 같은 백업을 다른 사용자가 복원해도 ID가 충돌하지 않아야 합니다.
        mvc.perform(put("/api/data").with(user("bob")).contentType(MediaType.APPLICATION_JSON).content(BACKUP))
                .andExpect(status().isOk());
        mvc.perform(post("/api/categories").with(user("bob")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"여행\",\"icon\":\"ti-plane\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/data").with(user("alice")))
                .andExpect(jsonPath("$.categories", hasSize(1)))
                .andExpect(jsonPath("$.records", hasSize(1)));
        mvc.perform(get("/api/data").with(user("bob")))
                .andExpect(jsonPath("$.categories", hasSize(2)));
        mvc.perform(get("/api/data").with(user("carol")))
                .andExpect(jsonPath("$.categories", hasSize(0)));
    }

    @Test
    void updatesCategoryWithoutLosingRecords() throws Exception {
        String body = mvc.perform(put("/api/data").with(user("dave")).contentType(MediaType.APPLICATION_JSON)
                        .content(BACKUP))
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(body, "$.categories[0].id");

        mvc.perform(put("/api/categories/" + id).with(user("dave")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" 비디오 게임 \",\"icon\":\"ti-trophy\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.name").value("비디오 게임"))
                .andExpect(jsonPath("$.icon").value("ti-trophy"));
        mvc.perform(get("/api/data").with(user("dave")))
                .andExpect(jsonPath("$.categories[0].name").value("비디오 게임"))
                .andExpect(jsonPath("$.records", hasSize(1)))
                .andExpect(jsonPath("$.records[0].category").value(id));

        // 지원하지 않는 아이콘과 빈 이름은 거부합니다.
        mvc.perform(put("/api/categories/" + id).with(user("dave")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"게임\",\"icon\":\"ti-unknown\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/categories/" + id).with(user("dave")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  \",\"icon\":\"ti-trophy\"}"))
                .andExpect(status().isBadRequest());
        // 다른 사용자의 카테고리는 찾을 수 없는 것으로 처리합니다.
        mvc.perform(put("/api/categories/" + id).with(user("erin")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"가로채기\",\"icon\":\"ti-trophy\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/data").with(user("dave")))
                .andExpect(jsonPath("$.categories[0].name").value("비디오 게임"));
    }

    /** date가 null이면 날짜 필드를 생략하고, "null"이면 JSON null을 넣습니다. */
    private static String dateField(String date) {
        if (date == null) return "";
        return date.equals("null") ? ",\"date\":null" : ",\"date\":\"" + date + "\"";
    }

    private static String recordInput(String category, String date) {
        return "{\"category\":\"" + category + "\",\"name\":\"점심\",\"amount\":12000" + dateField(date) + "}";
    }

    private static String backupWith(String date) {
        return """
                {"categories":[{"id":"games","name":"게임","icon":"ti-device-gamepad-2"}],
                 "records":[{"id":"r1","category":"games","name":"스팀","amount":52000,"date":"2026-06-02"},
                            {"id":"r2","category":"games","name":"패키지","amount":30000%s}]}
                """.formatted(dateField(date));
    }

    private static ResultMatcher reason(String message) {
        return result -> {
            assertThat(result.getResolvedException()).isInstanceOf(ResponseStatusException.class);
            assertThat(((ResponseStatusException) result.getResolvedException()).getReason()).isEqualTo(message);
        };
    }

    /** 백업을 복원한 뒤 GET /api/data 응답 본문을 돌려줍니다. */
    private String restoreBackup(String owner) throws Exception {
        mvc.perform(put("/api/data").with(user(owner)).contentType(MediaType.APPLICATION_JSON).content(BACKUP))
                .andExpect(status().isOk());
        return mvc.perform(get("/api/data").with(user(owner))).andReturn().getResponse().getContentAsString();
    }

    @Test
    void acceptsRecordDatesFromLowerBoundToSeoulToday() throws Exception {
        String data = restoreBackup("frank");
        String category = com.jayway.jsonpath.JsonPath.read(data, "$.categories[0].id");
        String recordId = com.jayway.jsonpath.JsonPath.read(data, "$.records[0].id");

        for (String date : List.of("2000-01-01", "2026-06-01", "2026-06-02")) {
            mvc.perform(post("/api/records").with(user("frank")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInput(category, date)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.date").value(date));
            mvc.perform(put("/api/records/" + recordId).with(user("frank")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInput(category, date)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(recordId))
                    .andExpect(jsonPath("$.date").value(date));
            mvc.perform(put("/api/data").with(user("grace")).contentType(MediaType.APPLICATION_JSON)
                            .content(backupWith(date)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.records", hasSize(2)))
                    .andExpect(jsonPath("$.records[?(@.name == '패키지')].date", contains(date)));
        }
    }

    @Test
    void rejectsRecordDatesOutsideRangeWithoutChangingData() throws Exception {
        String before = restoreBackup("henry");
        String category = com.jayway.jsonpath.JsonPath.read(before, "$.categories[0].id");
        String recordId = com.jayway.jsonpath.JsonPath.read(before, "$.records[0].id");

        // 범위 밖 날짜, JSON null, 날짜 필드 누락을 각각 확인합니다.
        String[][] cases = {
                {"1999-12-31", DATE_RANGE_ERROR},
                {"2026-06-03", DATE_RANGE_ERROR},
                {"null", DATE_REQUIRED_ERROR},
                {null, DATE_REQUIRED_ERROR}};
        for (String[] c : cases) {
            mvc.perform(post("/api/records").with(user("henry")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInput(category, c[0])))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(c[1]));
            mvc.perform(put("/api/records/" + recordId).with(user("henry")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInput(category, c[0])))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(c[1]));
            // 정상 기록 뒤에 잘못된 기록이 있어도 복원 전체가 거부되어야 합니다.
            mvc.perform(put("/api/data").with(user("henry")).contentType(MediaType.APPLICATION_JSON)
                            .content(backupWith(c[0])))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(c[1]));
        }

        String after = mvc.perform(get("/api/data").with(user("henry")))
                .andReturn().getResponse().getContentAsString();
        assertThat(after).isEqualTo(before);
    }

    private static final String AMOUNT_RANGE_ERROR = "금액은 1원부터 10억 원까지 입력해 주세요";

    private static String recordInputWithAmount(String category, String name, long amount) {
        return "{\"category\":\"" + category + "\",\"name\":\"" + name + "\",\"amount\":" + amount
                + ",\"date\":\"2026-06-01\"}";
    }

    /** 정상 기록 뒤에 지정한 금액의 기록이 오는 백업입니다. */
    private static String backupWithAmount(long amount) {
        return """
                {"categories":[{"id":"games","name":"게임","icon":"ti-device-gamepad-2"}],
                 "records":[{"id":"r1","category":"games","name":"스팀","amount":52000,"date":"2026-06-02"},
                            {"id":"r2","category":"games","name":"패키지","amount":%d,"date":"2026-06-01"}]}
                """.formatted(amount);
    }

    private static java.util.Map<String, Object> recordWhere(String data, String field, String value) {
        List<java.util.Map<String, Object>> found =
                com.jayway.jsonpath.JsonPath.read(data, "$.records[?(@." + field + " == '" + value + "')]");
        assertThat(found).hasSize(1);
        return found.get(0);
    }

    private static long amountOf(java.util.Map<String, Object> record) {
        return ((Number) record.get("amount")).longValue();
    }

    @Test
    void acceptsRecordAmountsFromOneToOneBillion() throws Exception {
        String data = restoreBackup("paul");
        String category = com.jayway.jsonpath.JsonPath.read(data, "$.categories[0].id");
        String recordId = com.jayway.jsonpath.JsonPath.read(data, "$.records[0].id");
        restoreBackup("quinn");

        for (long amount : new long[] {1, 52000, 1_000_000_000L}) {
            String created = mvc.perform(post("/api/records").with(user("paul")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInputWithAmount(category, "생성 " + amount, amount)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.amount").value(amount))
                    .andReturn().getResponse().getContentAsString();
            String createdId = com.jayway.jsonpath.JsonPath.read(created, "$.id");
            var stored = recordWhere(dataOf("paul"), "id", createdId);
            assertThat(amountOf(stored)).isEqualTo(amount);
            assertThat(stored.get("category")).isEqualTo(category);

            mvc.perform(put("/api/records/" + recordId).with(user("paul")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInputWithAmount(category, "수정", amount)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(recordId))
                    .andExpect(jsonPath("$.amount").value(amount));
            assertThat(amountOf(recordWhere(dataOf("paul"), "id", recordId))).isEqualTo(amount);

            // 기존 데이터가 있는 사용자에게 복원하면 백업 데이터로 교체되어야 합니다.
            String restored = mvc.perform(put("/api/data").with(user("quinn")).contentType(MediaType.APPLICATION_JSON)
                            .content(backupWithAmount(amount)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.categories", hasSize(1)))
                    .andExpect(jsonPath("$.records", hasSize(2)))
                    .andReturn().getResponse().getContentAsString();
            assertThat(dataOf("quinn")).isEqualTo(restored);
            String restoredCategory = com.jayway.jsonpath.JsonPath.read(restored, "$.categories[0].id");
            var restoredRecord = recordWhere(restored, "name", "패키지");
            assertThat(amountOf(restoredRecord)).isEqualTo(amount);
            assertThat(restoredRecord.get("category")).isEqualTo(restoredCategory);
            assertThat(amountOf(recordWhere(restored, "name", "스팀"))).isEqualTo(52000);
        }
    }

    @Test
    void rejectsRecordAmountsOutsideRangeWithoutChangingData() throws Exception {
        String before = restoreBackup("rose");
        String category = com.jayway.jsonpath.JsonPath.read(before, "$.categories[0].id");
        String recordId = com.jayway.jsonpath.JsonPath.read(before, "$.records[0].id");

        for (long amount : new long[] {Long.MIN_VALUE, -1, 0, 1_000_000_001L, Long.MAX_VALUE}) {
            mvc.perform(post("/api/records").with(user("rose")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInputWithAmount(category, "점심", amount)))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(AMOUNT_RANGE_ERROR));
            assertThat(dataOf("rose")).isEqualTo(before);

            mvc.perform(put("/api/records/" + recordId).with(user("rose")).contentType(MediaType.APPLICATION_JSON)
                            .content(recordInputWithAmount(category, "점심", amount)))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(AMOUNT_RANGE_ERROR));
            assertThat(dataOf("rose")).isEqualTo(before);

            // 정상 기록 뒤에 범위 밖 금액이 있어도 복원 전체가 거부되어야 합니다.
            mvc.perform(put("/api/data").with(user("rose")).contentType(MediaType.APPLICATION_JSON)
                            .content(backupWithAmount(amount)))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(AMOUNT_RANGE_ERROR));
            assertThat(dataOf("rose")).isEqualTo(before);
        }
    }

    private static final String DUPLICATE_NAME_ERROR = "이미 있는 카테고리 이름입니다";
    private static final List<String> GAMES_VARIANTS = List.of("Games", "games", " Games ", " gAmEs ");

    private static String categoryInput(String name, String icon) {
        return "{\"name\":\"" + name + "\",\"icon\":\"" + icon + "\"}";
    }

    private static String backupWithCategories(String first, String second) {
        return """
                {"categories":[{"id":"a","name":"%s","icon":"ti-device-gamepad-2"},
                               {"id":"b","name":"%s","icon":"ti-plane"}],
                 "records":[{"id":"r1","category":"b","name":"항공권","amount":300000,"date":"2026-06-01"}]}
                """.formatted(first, second);
    }

    private String dataOf(String owner) throws Exception {
        return mvc.perform(get("/api/data").with(user(owner))).andReturn().getResponse().getContentAsString();
    }

    private static String categoryIdByName(String data, String name) {
        List<String> ids = com.jayway.jsonpath.JsonPath.read(data, "$.categories[?(@.name == '" + name + "')].id");
        assertThat(ids).hasSize(1);
        return ids.get(0);
    }

    private String createCategory(String owner, String name, String icon) throws Exception {
        String body = mvc.perform(post("/api/categories").with(user(owner)).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput(name, icon)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(body, "$.id");
    }

    @Test
    void rejectsDuplicateCategoryNamesOnCreate() throws Exception {
        String gamesId = createCategory("ivy", "Games", "ti-device-gamepad-2");
        String before = dataOf("ivy");

        for (String name : GAMES_VARIANTS) {
            mvc.perform(post("/api/categories").with(user("ivy")).contentType(MediaType.APPLICATION_JSON)
                            .content(categoryInput(name, "ti-trophy")))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(DUPLICATE_NAME_ERROR));
            assertThat(dataOf("ivy")).isEqualTo(before);
        }
        mvc.perform(get("/api/data").with(user("ivy")))
                .andExpect(jsonPath("$.categories", hasSize(1)))
                .andExpect(jsonPath("$.categories[0].id").value(gamesId))
                .andExpect(jsonPath("$.categories[0].name").value("Games"))
                .andExpect(jsonPath("$.categories[0].icon").value("ti-device-gamepad-2"));

        // 다른 사용자의 이름과는 비교하지 않습니다.
        createCategory("jack", "Games", "ti-device-gamepad-2");

        mvc.perform(post("/api/categories").with(user("ivy")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput(" Travel ", "ti-plane")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Travel"));
        mvc.perform(get("/api/data").with(user("ivy"))).andExpect(jsonPath("$.categories", hasSize(2)));
    }

    @Test
    void rejectsDuplicateCategoryNamesOnUpdateExceptItself() throws Exception {
        mvc.perform(put("/api/data").with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                        .content(backupWithCategories("Games", "Travel")))
                .andExpect(status().isOk());
        String before = dataOf("kate");
        String gamesId = categoryIdByName(before, "Games");
        String travelId = categoryIdByName(before, "Travel");

        for (String name : GAMES_VARIANTS) {
            mvc.perform(put("/api/categories/" + travelId).with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                            .content(categoryInput(name, "ti-trophy")))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(DUPLICATE_NAME_ERROR));
            assertThat(dataOf("kate")).isEqualTo(before);
        }

        // 자기 자신의 이름은 그대로 두거나 공백·대소문자만 바꿔도 됩니다.
        mvc.perform(put("/api/categories/" + gamesId).with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput("Games", "ti-device-gamepad-2")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(gamesId))
                .andExpect(jsonPath("$.name").value("Games"));
        mvc.perform(put("/api/categories/" + gamesId).with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput(" games ", "ti-device-gamepad-2")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(gamesId))
                .andExpect(jsonPath("$.name").value("games"));
        mvc.perform(put("/api/categories/" + travelId).with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput("Travel", "ti-camera")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(travelId))
                .andExpect(jsonPath("$.name").value("Travel"))
                .andExpect(jsonPath("$.icon").value("ti-camera"));
        mvc.perform(get("/api/data").with(user("kate")))
                .andExpect(jsonPath("$.categories", hasSize(2)))
                .andExpect(jsonPath("$.records", hasSize(1)))
                .andExpect(jsonPath("$.records[0].category").value(travelId));

        // 다른 사용자에게만 있는 이름으로는 바꿀 수 있습니다.
        createCategory("liam", "Music", "ti-music");
        mvc.perform(put("/api/categories/" + travelId).with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput("Music", "ti-music")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Music"));

        // 다른 사용자의 카테고리 ID나 없는 ID는 기존대로 404입니다.
        mvc.perform(put("/api/categories/" + travelId).with(user("liam")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput("Games", "ti-music")))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/categories/missing").with(user("kate")).contentType(MediaType.APPLICATION_JSON)
                        .content(categoryInput("Games", "ti-music")))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsDuplicateCategoryNamesInBackup() throws Exception {
        String before = restoreBackup("mia");

        for (String name : GAMES_VARIANTS) {
            mvc.perform(put("/api/data").with(user("mia")).contentType(MediaType.APPLICATION_JSON)
                            .content(backupWithCategories("Games", name)))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(DUPLICATE_NAME_ERROR));
            assertThat(dataOf("mia")).isEqualTo(before);
        }

        // 현재 데이터와 같은 이름이나 다른 사용자의 이름은 백업 안에서 겹치지 않으면 허용합니다.
        createCategory("noah", "Travel", "ti-plane");
        String restored = mvc.perform(put("/api/data").with(user("mia")).contentType(MediaType.APPLICATION_JSON)
                        .content(backupWithCategories("게임", " Travel ")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories", hasSize(2)))
                .andExpect(jsonPath("$.records", hasSize(1)))
                .andReturn().getResponse().getContentAsString();
        String travelId = categoryIdByName(restored, "Travel");
        assertThat(travelId).isNotEqualTo("b");
        assertThat(categoryIdByName(restored, "게임")).isNotEqualTo("a");
        assertThat((String) com.jayway.jsonpath.JsonPath.read(restored, "$.records[0].category")).isEqualTo(travelId);
    }

    @Test
    void keepsExistingBackupValidation() throws Exception {
        String before = restoreBackup("olivia");
        String[][] cases = {
                {"""
                 {"categories":[{"id":"a","name":"A","icon":"ti-plane"},{"id":"a","name":"B","icon":"ti-plane"}],
                  "records":[]}
                 """, "카테고리 ID가 중복되었습니다"},
                {"""
                 {"categories":[{"id":"a","name":" ","icon":"ti-plane"}],"records":[]}
                 """, "카테고리 이름을(를) 1~120자로 입력해 주세요"},
                {"""
                 {"categories":[{"id":"a","name":"A","icon":"ti-unknown"}],"records":[]}
                 """, "지원하지 않는 아이콘입니다"}};
        for (String[] c : cases) {
            mvc.perform(put("/api/data").with(user("olivia")).contentType(MediaType.APPLICATION_JSON).content(c[0]))
                    .andExpect(status().isBadRequest())
                    .andExpect(reason(c[1]));
            assertThat(dataOf("olivia")).isEqualTo(before);
        }

        mvc.perform(put("/api/data").with(user("olivia")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categories\":[],\"records\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories", hasSize(0)))
                .andExpect(jsonPath("$.records", hasSize(0)));
    }
}
