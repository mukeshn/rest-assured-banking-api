package com.mukeshn.bankapi.model;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TransferRequest(String fromAccountId, String beneficiaryName, String iban, Double amount, String reference, String executionDate) {
    public static TransferRequest valid(double amount) {
        return new TransferRequest("ACC-001", "Stadtwerke Augsburg", "DE02120300000000202051", amount, "Invoice 2026-11", null);
    }
    public TransferRequest withIban(String v) { return new TransferRequest(fromAccountId, beneficiaryName, v, amount, reference, executionDate); }
    public TransferRequest withFrom(String v) { return new TransferRequest(v, beneficiaryName, iban, amount, reference, executionDate); }
    public TransferRequest withDate(String v) { return new TransferRequest(fromAccountId, beneficiaryName, iban, amount, reference, v); }
}
