package com.mukeshn.bankapi.tests;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import com.mukeshn.bankapi.support.Auth;
import com.mukeshn.bankapi.support.Specs;
import java.util.Map;
import org.testng.annotations.Test;

public class AuthTest {

    @Test(groups = "smoke")
    public void loginReturnsSmsChallenge() {
        given().spec(Specs.base()).body(Map.of("username", "j.schneider", "password", "Demo#2026"))
                .when().post("/auth/login")
                .then().spec(Specs.fast()).statusCode(200).body("method", equalTo("SMS")).body("challengeId", matchesPattern("[0-9a-f-]{36}"));
    }

    @Test
    public void wrongPasswordIs401() {
        given().spec(Specs.base()).body(Map.of("username", "j.schneider", "password", "x"))
                .post("/auth/login").then().statusCode(401).body("error", equalTo("INVALID_CREDENTIALS"));
    }

    @Test
    public void blockedUserIs403() {
        given().spec(Specs.base()).body(Map.of("username", "blocked.user", "password", "Demo#2026"))
                .post("/auth/login").then().statusCode(403).body("error", equalTo("ACCOUNT_BLOCKED"));
    }

    @Test
    public void otpLocksAfterThreeAttempts() {
        String challenge = given().spec(Specs.base()).body(Map.of("username", "m.weber", "password", "Demo#2026"))
                .post("/auth/login").then().extract().path("challengeId");
        for (int left = 2; left >= 1; left--) {
            given().spec(Specs.base()).body(Map.of("challengeId", challenge, "otp", "000000"))
                    .post("/auth/otp").then().statusCode(401).body("attemptsLeft", equalTo(left));
        }
        given().spec(Specs.base()).body(Map.of("challengeId", challenge, "otp", "000000"))
                .post("/auth/otp").then().statusCode(429).body("error", equalTo("TOO_MANY_ATTEMPTS"));
    }

    @Test
    public void missingTokenIs401() {
        given().spec(Specs.base()).get("/accounts").then().statusCode(401).body("error", equalTo("UNAUTHORIZED"));
    }

    @Test
    public void readOnlyClientCannotTransfer() {
        String token = Auth.clientToken("readonly-app", "r34d-0nly");
        given().spec(Specs.authed(token)).body(Map.of("fromAccountId", "ACC-001", "beneficiaryName", "X", "iban", "DE02120300000000202051", "amount", 1))
                .post("/transfers").then().statusCode(403).body("required", equalTo("transfers:write"));
    }
}
