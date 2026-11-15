package com.mukeshn.bankapi.support;

import io.restassured.builder.RequestSpecBuilder;
import io.restassured.builder.ResponseSpecBuilder;
import io.restassured.filter.log.LogDetail;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import io.restassured.specification.ResponseSpecification;
import java.util.concurrent.TimeUnit;
import static org.hamcrest.Matchers.lessThan;

public final class Specs {
    private Specs() {}

    public static final String BASE_URL = System.getProperty("base.url", "http://localhost:4173");

    public static RequestSpecification base() {
        return new RequestSpecBuilder().setBaseUri(BASE_URL).setBasePath("/api/bank").setContentType(ContentType.JSON)
                .log(LogDetail.URI).build();
    }

    public static RequestSpecification authed(String token) {
        return new RequestSpecBuilder().addRequestSpecification(base()).addHeader("Authorization", "Bearer " + token).build();
    }

    public static ResponseSpecification fast() {
        return new ResponseSpecBuilder().expectResponseTime(lessThan(2000L), TimeUnit.MILLISECONDS).build();
    }
}
