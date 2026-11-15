package com.mukeshn.bankapi.support;

import static io.restassured.RestAssured.given;

import java.util.Map;

public final class Auth {
    private Auth() {}

    /** Two-step login: password -> challenge -> OTP from the sandbox endpoint. */
    public static String customerToken(String username) {
        String challenge = given().spec(Specs.base()).body(Map.of("username", username, "password", "Demo#2026"))
                .post("/auth/login").then().statusCode(200).extract().path("challengeId");
        String otp = given().spec(Specs.base()).get("/__test/otp").then().extract().path("otp");
        return given().spec(Specs.base()).body(Map.of("challengeId", challenge, "otp", otp))
                .post("/auth/otp").then().statusCode(200).extract().path("accessToken");
    }

    public static String clientToken(String clientId, String secret) {
        return given().baseUri(Specs.BASE_URL).contentType("application/x-www-form-urlencoded")
                .formParam("grant_type", "client_credentials").formParam("client_id", clientId).formParam("client_secret", secret)
                .post("/api/bank/oauth/token").then().statusCode(200).extract().path("access_token");
    }
}
