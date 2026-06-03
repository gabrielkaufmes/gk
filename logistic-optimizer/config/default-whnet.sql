/*
  Default WHNet query for Logistic Optimizer.
  Returns one row per Aluplast order with aggregated scan info from v_czynnosci.

  Structure:
    1. AluplastOrders   - the same order universe as the Aluplast query
    2. ScansForOrders   - scan events restricted to those orders
    3. LatestScan       - the most-recent scan per order (lastScanStage / Workstation / Time)
    4. PieceCounts      - distinct piece counts + how many hit a "finished" action

  TBDs you will need to fix in the Mapping screen:
    - optiBatch:   returned as NULL. Source column unknown. Try v_czynnosci.Optymalizacja
                   or another table; edit the SELECT to fill it in.
    - readyCount:  uses a best-guess pattern (ActionName LIKE '%FINISHED%' OR '%PACK%').
                   Replace with the real action codes once you know them.

  WITH (NOLOCK) hints used throughout — dirty reads are acceptable for a
  dispatcher dashboard and avoid waiting on factory write transactions.
*/

DECLARE @FromDate date = '2025-01-01';

WITH AluplastOrders AS
(
    SELECT
        o.indeks                                          AS Srcdoc,
        LTRIM(RTRIM(CONVERT(nvarchar(50), o.zlecenie_t))) AS OrderNo
    FROM [Aluplast].[dbo].[oferty] AS o WITH (NOLOCK)
    WHERE o.zlecenie_t IS NOT NULL
      AND o.zlecenie_t <> ''
      AND o.realizacja > @FromDate
      AND o.stan NOT IN ('Zlecenia', 'Zamkniete zlecenia')
      AND (
          (o.linia_prod = 1 AND ISNULL(o.alu_pcs, 0) > 0)
          OR
          (o.linia_prod = 0 AND ISNULL(o.il_osc, 0) > 0)
      )
),

ScansForOrders AS
(
    SELECT
        c.Zlecenie    AS OrderNo,
        c.Data,
        c.ActionName,
        c.Stanowisko,
        c.Pozycja,
        c.Oscieznica,
        c.Skrzydlo,
        c.Sztuka
    FROM [WHNet].[dbo].[v_czynnosci] AS c WITH (NOLOCK)
    INNER JOIN AluplastOrders AS ao ON ao.OrderNo = c.Zlecenie
    WHERE c.Zlecenie IS NOT NULL
),

LatestScan AS
(
    SELECT
        OrderNo,
        Data        AS lastScanTime,
        ActionName  AS lastScanStage,
        Stanowisko  AS lastScanWorkstation,
        ROW_NUMBER() OVER (PARTITION BY OrderNo ORDER BY Data DESC) AS rn
    FROM ScansForOrders
),

PieceCounts AS
(
    SELECT
        OrderNo,
        COUNT(DISTINCT CONCAT(Pozycja,'/',Oscieznica,'/',Skrzydlo,'/',Sztuka)) AS totalPieces,
        COUNT(DISTINCT CASE
            WHEN ActionName LIKE '%FINISHED%' OR ActionName LIKE '%PACK%'
            THEN CONCAT(Pozycja,'/',Oscieznica,'/',Skrzydlo,'/',Sztuka)
        END)                                                                  AS readyCount
    FROM ScansForOrders
    GROUP BY OrderNo
)

SELECT
    ls.OrderNo                  AS orderNo,
    ls.lastScanTime             AS lastScanTime,
    ls.lastScanStage            AS lastScanStage,
    ls.lastScanWorkstation      AS lastScanWorkstation,
    ISNULL(pc.totalPieces, 0)   AS totalPieces,
    ISNULL(pc.readyCount,  0)   AS readyCount,
    CAST(NULL AS NVARCHAR(50))  AS optiBatch         -- TBD: source column unknown
FROM LatestScan AS ls
LEFT JOIN PieceCounts AS pc ON pc.OrderNo = ls.OrderNo
WHERE ls.rn = 1
ORDER BY ls.lastScanTime DESC;
