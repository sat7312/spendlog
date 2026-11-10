package sat7312.spendlog;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/** 로그인 기능이 있던 시절의 H2 파일 DB(owner_id 컬럼, users 테이블)를 그대로 열 수 있는지 확인합니다. */
class LocalDatabaseCompatibilityTests {
    @TempDir
    Path dir;

    @Test
    void opensOldSchemaAndKeepsAllRows() throws Exception {
        String url = "jdbc:h2:file:" + dir.resolve("old-data") + ";DB_CLOSE_ON_EXIT=FALSE";
        try (var conn = DriverManager.getConnection(url, "sa", "");
                var st = conn.createStatement()) {
            st.execute("create table users (id varchar(255) primary key, email varchar(255), name varchar(255))");
            st.execute("create table categories (id varchar(255) primary key, owner_id varchar(255),"
                    + " name varchar(255), icon varchar(255))");
            st.execute("create table expense_records (id varchar(255) primary key, owner_id varchar(255),"
                    + " category_id varchar(255) not null references categories(id), name varchar(255),"
                    + " amount bigint not null, date date)");
            st.execute("insert into users values ('u1', 'a@example.com', 'A')");
            st.execute("insert into categories values ('c1', 'u1', '게임', 'ti-device-gamepad-2'),"
                    + " ('c2', 'u2', '여행', 'ti-plane'), ('c3', null, '음악', 'ti-music')");
            st.execute("insert into expense_records values ('r1', 'u1', 'c1', '스팀', 52000, date '2026-06-01'),"
                    + " ('r2', null, 'c2', '항공권', 300000, date '2026-06-02')");
        }

        try (ConfigurableApplicationContext app = start(url)) {
            SpendlogApi api = app.getBean(SpendlogApi.class);
            var data = api.data();
            // owner 값과 상관없이 모든 행이 하나의 가계부로 보여야 합니다.
            assertThat(data.categories()).extracting(SpendlogApi.CategoryData::id)
                    .containsExactlyInAnyOrder("c1", "c2", "c3");
            assertThat(data.records()).extracting(SpendlogApi.RecordData::id)
                    .containsExactlyInAnyOrder("r1", "r2");
            assertThat(data.records()).filteredOn(r -> r.id().equals("r2"))
                    .extracting(SpendlogApi.RecordData::category).containsExactly("c2");

            // owner_id 값을 넣지 않아도 새로 저장할 수 있어야 합니다.
            var food = api.addCategory(new SpendlogApi.CategoryInput("식비", "ti-pizza"));
            api.addRecord(new SpendlogApi.RecordInput(food.id(), "점심", 12000, LocalDate.of(2026, 6, 1)));
        }

        // 다시 시작해도 기존 데이터와 새 데이터가 모두 남아 있어야 합니다.
        try (ConfigurableApplicationContext app = start(url)) {
            var data = app.getBean(SpendlogApi.class).data();
            assertThat(data.categories()).hasSize(4);
            assertThat(data.records()).hasSize(3);
        }
    }

    private static ConfigurableApplicationContext start(String url) {
        return new SpringApplicationBuilder(SpendlogApplication.class)
                .web(WebApplicationType.NONE)
                .run("--spring.datasource.url=" + url, "--spring.devtools.restart.enabled=false");
    }
}
