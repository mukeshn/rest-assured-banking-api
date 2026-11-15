package com.mukeshn.bankapi.tests;

import static io.restassured.RestAssured.given;
import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.hamcrest.Matchers.*;

import com.mukeshn.bankapi.support.Auth;
import com.mukeshn.bankapi.support.Specs;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

public class AccountsTest {
    private String token;

    @BeforeClass
    public void login() { token = Auth.customerToken("j.schneider"); }

    @Test(groups = "smoke")
    public void accountsMatchSchema() {
        given().spec(Specs.authed(token)).get("/accounts")
                .then().statusCode(200)
                .body(matchesJsonSchemaInClasspath("schemas/accounts.json"))
                .body("accounts", hasSize(3))
                .body("accounts.type", contains("CHECKING", "SAVINGS", "CREDIT_CARD"))
                .body("accounts.find { it.id == 'ACC-003' }.maskedPan", endsWith("4417"));
    }

    @Test
    public void transactionsFilteredByCategoryAndDate() {
        given().spec(Specs.authed(token)).queryParam("from", "2026-11-03").queryParam("to", "2026-11-07")
                .get("/accounts/ACC-001/transactions")
                .then().statusCode(200).body("count", equalTo(3)).body("transactions.date", everyItem(allOf(greaterThanOrEqualTo("2026-11-03"), lessThanOrEqualTo("2026-11-07"))));
        given().spec(Specs.authed(token)).queryParam("category", "INCOME").get("/accounts/ACC-001/transactions")
                .then().body("transactions.amount", everyItem(greaterThan(0f)));
    }

    @Test
    public void unknownAccountIs404() {
        given().spec(Specs.authed(token)).get("/accounts/ACC-999").then().statusCode(404).body("error", equalTo("ACCOUNT_NOT_FOUND"));
    }

    @Test
    public void statementIsCsvAttachment() {
        given().spec(Specs.authed(token)).get("/accounts/ACC-001/statement.csv")
                .then().statusCode(200).contentType(containsString("text/csv"))
                .header("Content-Disposition", containsString("statement-ACC-001-2026-11.csv"))
                .body(startsWith("date;description;category;amount"));
    }
}
