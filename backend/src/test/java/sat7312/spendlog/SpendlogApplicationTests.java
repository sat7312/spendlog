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
}
