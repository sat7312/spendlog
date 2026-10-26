package sat7312.spendlog;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class SpendlogApplication {

	public static void main(String[] args) {
		SpringApplication.run(SpendlogApplication.class, args);
	}

	/** 기록 날짜의 '오늘'은 프런트엔드와 같이 서울 기준으로 계산합니다. */
	@Bean
	Clock clock() {
		return Clock.system(ZoneId.of("Asia/Seoul"));
	}

}
