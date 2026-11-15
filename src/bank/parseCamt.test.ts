// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseCamt } from "./parseCamt";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Acct><Id><IBAN>SK3112000000198742637541</IBAN></Id></Acct>
<Ntry><Amt Ccy="EUR">1500.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2025-02-10</Dt></BookgDt>
 <NtryDtls><TxDtls><Refs><EndToEndId>/VS2025/SS9/KS0558</EndToEndId></Refs>
 <RltdPties><Dbtr><Nm>Klient a.s.</Nm></Dbtr><DbtrAcct><Id><IBAN>SK6807200002891987426353</IBAN></Id></DbtrAcct></RltdPties>
 <RmtInf><Ustrd>Faktura 12</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">45.80</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2025-02-20</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Sociálna poisťovňa</Nm></Cdtr><CdtrAcct><Id><IBAN>SK0281800000007000157429</IBAN></Id></CdtrAcct></RltdPties>
 <RmtInf><Strd><CdtrRefInf><Ref>VS 1234567</Ref></CdtrRefInf></Strd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;

describe("parseCamt", () => {
  it("číta príjem aj výdaj", () => {
    const r = parseCamt(XML);
    expect(r.ownIban).toBe("SK3112000000198742637541");
    expect(r.txs).toHaveLength(2);
    expect(r.txs[0]).toMatchObject({ date: "2025-02-10", amount: 1500, currency: "EUR", counterparty: "Klient a.s.", iban: "SK6807200002891987426353", vs: "2025", ss: "9", ks: "0558", description: "Faktura 12" });
    expect(r.txs[1]).toMatchObject({ amount: -45.8, counterparty: "Sociálna poisťovňa", vs: "1234567" });
  });
  it("neplatné XML", () => {
    expect(parseCamt("<a><b></a>").txs).toHaveLength(0);
  });
});
