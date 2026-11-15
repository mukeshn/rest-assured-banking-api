package com.mukeshn.bankapi.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Transfer(String id, String fromAccountId, String beneficiaryName, String iban, double amount, String currency, String status, String executionDate) {}
