package com.mukeshn.bankapi.tests;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.testng.Assert.assertEquals;

import com.mukeshn.bankapi.model.Transfer;
import com.mukeshn.bankapi.model.TransferRequest;
import com.mukeshn.bankapi.support.Auth;
import com.mukeshn.bankapi.support.Specs;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

public class TransferTest {
    private String token;

    @BeforeMethod
    public void freshSession() { token = Auth.customerToken("j.schneider"); }

    @Test(groups = "smoke")
    public void transferIsExecutedAndDebited() {
        Transfer t = given().spec(Specs.authed(token)).body(TransferRequest.valid(120.50))
                .post("/transfers").then().statusCode(201).header("Location", startsWith("/api/bank/transfers/TRF-"))
                .extract().as(Transfer.class);
        assertEquals(t.status(), "EXECUTED");
        given().spec(Specs.authed(token)).get("/accounts/ACC-001").then().body("balance", equalTo(3130.25f));
        given().spec(Specs.authed(token)).get("/transfers/" + t.id()).then().body("beneficiaryName", equalTo("Stadtwerke Augsburg"));
    }

    @DataProvider
    public Object[][] invalidIbans() {
        return new Object[][] { {"DE03120300000000202051"}, {"DE0212030000000020205"}, {"XX"}, {""} };
    }

    @Test(dataProvider = "invalidIbans")
    public void invalidIbanIsRejected(String iban) {
        given().spec(Specs.authed(token)).body(TransferRequest.valid(10).withIban(iban))
                .post("/transfers").then().statusCode(422).body("errors.field", hasItem("iban"));
    }

    @Test
    public void creditCardCannotBeSource() {
        given().spec(Specs.authed(token)).body(TransferRequest.valid(10).withFrom("ACC-003"))
                .post("/transfers").then().statusCode(422).body("errors[0].message", equalTo("Transfers from credit card accounts are not allowed"));
    }

    @Test
    public void insufficientFundsIs409() {
        given().spec(Specs.authed(token)).body(TransferRequest.valid(99_999))
                .post("/transfers").then().statusCode(409).body("error", equalTo("INSUFFICIENT_FUNDS")).body("available", equalTo(3250.75f));
    }

    @Test
    public void dailyLimitAcrossTransfers() {
        given().spec(Specs.authed(token)).body(TransferRequest.valid(4500).withFrom("ACC-002")).post("/transfers").then().statusCode(201);
        given().spec(Specs.authed(token)).body(TransferRequest.valid(600).withFrom("ACC-002"))
                .post("/transfers").then().statusCode(409).body("error", equalTo("DAILY_LIMIT_EXCEEDED")).body("remaining", equalTo(500f));
    }

    @Test
    public void scheduledTransferCanBeCancelled() {
        String id = given().spec(Specs.authed(token)).body(TransferRequest.valid(25).withDate("2099-12-31"))
                .post("/transfers").then().statusCode(201).body("status", equalTo("SCHEDULED")).extract().path("id");
        given().spec(Specs.authed(token)).delete("/transfers/" + id).then().statusCode(200).body("status", equalTo("CANCELLED"));
        given().spec(Specs.authed(token)).delete("/transfers/" + id).then().statusCode(409);
    }
}
