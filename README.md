    # RestAssured Banking API

    [![CI](https://github.com/mukeshn/rest-assured-banking-api/actions/workflows/ci.yml/badge.svg)](https://github.com/mukeshn/rest-assured-banking-api/actions/workflows/ci.yml)
    ![Java](https://img.shields.io/badge/Java-21-ED8B00?logo=openjdk&logoColor=white)
    ![RestAssured](https://img.shields.io/badge/RestAssured-6.3.0-5A9E4B)
    ![TestNG](https://img.shields.io/badge/TestNG-7.12.0-orange)
    ![Maven](https://img.shields.io/badge/Maven-3.9-C71A36?logo=apachemaven&logoColor=white)
    [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

    REST API test suite for a banking backend, built with RestAssured, TestNG, JSON Schema validation and Jackson POJOs. It covers two-step customer authentication, OAuth2 client credentials with scopes, accounts, transactions, CSV statements and SEPA transfer business rules.

    | Area | Details |
    |---|---|
    | Auth | password → SMS challenge → OTP, 3-attempt lockout, OAuth2 client credentials, scope enforcement |
| Contracts | JSON Schema (`schemas/accounts.json`), Groovy GPath assertions |
| Business rules | IBAN checksum, credit card not allowed as source, insufficient funds, 5.000 € daily limit, scheduled + cancel |
| Design | Request/Response spec builders, immutable request records, data providers |
| Non-functional | response time budget in the shared response spec |


    ## Run locally

    ```bash
    node sut/server.mjs &          # start the bundled system under test (Node 20+)
    mvn verify                     # headless Chrome by default
    mvn verify -Dheadless=false    # watch it run
    mvn verify -Dbrowser=firefox
    mvn verify -Dgrid.url=http://localhost:4444   # run on Selenium Grid
    ```

    The suite runs against `http://localhost:4173` unless `-Dbase.url=...` is given.
