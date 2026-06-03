/*
  Default Aluplast query for Logistic Optimizer — performance-optimized version.

  KEY DIFFERENCES from the original sql_query.txt:
    - TOP 500 + ORDER BY pushed into the innermost SELECT, so only 500 rows
      go through address resolution and column selection. The original ran
      address resolution over the entire result then ordered/took-top, which
      forced SQL Server to scan/sort everything.
    - Customer-code extraction (the PATINDEX/LIKE prefix logic) is done in
      JavaScript after fetch — keeps SQL doing only what SQL is good at.
    - The 3-stage CTE (BaseAddress -> AddressPrepared -> AddressSelected)
      is collapsed to one COALESCE for the delivery-city waterfall.
    - WITH (NOLOCK) hints on the joined tables avoid waiting for locks held
      by the factory's transactions (read-only context, dirty reads OK for
      a dispatcher dashboard).

  Columns marked  -- TBD  use NULL until Gabriel confirms the right source column.
  Edit this query in the Mapping screen and click Save to persist your changes.
*/

WITH TopOrders AS
(
    SELECT TOP 500
        ofr.indeks,
        ofr.zlecenie_t,
        ofr.odbiorca,
        ofr.adr_dostaw,
        ofr.linia_prod,
        ofr.alu_pcs,
        ofr.il_osc,
        ofr.realizacja,
        ofr.datafin,
        ofr.stan,
        ofr.notes,
        ofr.delivery_addres_av,

        -- Material order/delivery dates
        ofr.prof_dat_zam,  ofr.prof_dat_dost,     -- P = Profiles
        -- TBD: matF (Reinforcements / stalowanie) source columns unknown
        ofr.profd_dat_zam, ofr.profd_dat_dost,    -- A = Additional profiles (best guess)
        ofr.szyb_dat_zam,  ofr.szyb_dat_dost,     -- G = Glass / szyby
        ofr.rol_dat_zam,   ofr.rol_dat_dost,      -- R = Rolety / shutters
        ofr.dek_dat_zam,   ofr.dek_dat_dost,      -- D = Dekoracje / door fillings
        ofr.ok_dat_zam,    ofr.ok_dat_dost        -- O = Okucia / hardware
    FROM [Aluplast].[dbo].[oferty] AS ofr WITH (NOLOCK)
    WHERE
        ofr.zlecenie_t IS NOT NULL
        AND ofr.zlecenie_t <> ''
        AND ofr.realizacja > '2025-01-01'
        AND ofr.stan NOT IN ('Zlecenia', 'Zamkniete zlecenia')
        AND (
            (ofr.linia_prod = 1 AND ISNULL(ofr.alu_pcs, 0) > 0)
            OR
            (ofr.linia_prod = 0 AND ISNULL(ofr.il_osc, 0) > 0)
        )
    ORDER BY ofr.indeks DESC
)

SELECT
    CAST(o.zlecenie_t AS NVARCHAR(50))            AS orderNo,
    o.zlecenie_t                                  AS orderNoRaw,         -- raw for JS customerCode extraction
    CASE WHEN o.linia_prod = 1 THEN ISNULL(o.alu_pcs, 0) ELSE ISNULL(o.il_osc, 0) END AS pcs,
    o.stan                                        AS status,
    o.datafin                                     AS finValid,
    o.realizacja                                  AS dd,
    o.realizacja                                  AS termRe,        -- TBD: separate column?

    -- Materials: 7 mats x (promised, actual)
    o.prof_dat_zam                                AS matP_promised,
    o.prof_dat_dost                               AS matP_actual,
    CAST(NULL AS DATE)                            AS matF_promised, -- TBD
    CAST(NULL AS DATE)                            AS matF_actual,   -- TBD
    o.profd_dat_zam                               AS matA_promised, -- best guess
    o.profd_dat_dost                              AS matA_actual,   -- best guess
    o.szyb_dat_zam                                AS matG_promised,
    o.szyb_dat_dost                               AS matG_actual,
    o.rol_dat_zam                                 AS matR_promised,
    o.rol_dat_dost                                AS matR_actual,
    o.dek_dat_zam                                 AS matD_promised,
    o.dek_dat_dost                                AS matD_actual,
    o.ok_dat_zam                                  AS matO_promised,
    o.ok_dat_dost                                 AS matO_actual,

    -- Delivery-city waterfall (single COALESCE, no stacked CTEs)
    COALESCE(
        NULLIF(LTRIM(RTRIM(o.delivery_addres_av)), ''),
        NULLIF(LTRIM(RTRIM(CONCAT(dost.kod, ' ', dost.miasto))), ''),
        NULLIF(LTRIM(RTRIM(CONCAT(dost.ulica, ' ', dost.numer))), ''),
        NULLIF(LTRIM(RTRIM(CONCAT(kl.kod, ' ', kl.miasto))), ''),
        NULLIF(LTRIM(RTRIM(CONCAT(kl.ulica, ' ', kl.numer))), ''),
        'NO ADDRESS'
    )                                             AS deliveryCity,

    -- Initial value for the dispatcher description column
    o.notes                                       AS notesInitial

FROM TopOrders AS o
LEFT JOIN [Aluplast].[dbo].[klienci] AS kl   WITH (NOLOCK) ON kl.indeks   = o.odbiorca
LEFT JOIN [Aluplast].[dbo].[klienci] AS dost WITH (NOLOCK) ON dost.indeks = o.adr_dostaw
ORDER BY o.indeks DESC;
