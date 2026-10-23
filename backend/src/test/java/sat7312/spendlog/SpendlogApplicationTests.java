package sat7312.spendlog;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:spendlog-test")
@AutoConfigureMockMvc
class SpendlogApplicationTests {
    private static final String BACKUP = """
            {"categories":[{"id":"games","name":"게임","icon":"ti-device-gamepad-2"}],
             "records":[{"id":"r1","category":"games","name":"스팀","amount":52000,"date":"2026-06-02"}]}
            """;

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
}
