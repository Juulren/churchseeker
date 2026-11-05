using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Persistence;

/// <summary>
/// A local SQLite database is created once by EnsureCreated, which never changes a database that already exists. So when the
/// model grows, the pieces it adds are applied here, idempotently, to a development database made by an older version.
/// (PostgreSQL uses migrations instead.) Every step first looks at what is already there.
/// </summary>
public static class SqliteUpgrades
{
    public static async Task ApplyAsync(AppDbContext db, CancellationToken ct = default)
    {
        // Which churches a user may work in (added with the church access model).
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "UserChurchAccess" (
                "UserId" TEXT NOT NULL,
                "ChurchId" TEXT NOT NULL,
                "GrantedAt" TEXT NOT NULL,
                CONSTRAINT "PK_UserChurchAccess" PRIMARY KEY ("UserId", "ChurchId"),
                CONSTRAINT "FK_UserChurchAccess_AspNetUsers_UserId" FOREIGN KEY ("UserId") REFERENCES "AspNetUsers" ("Id") ON DELETE CASCADE,
                CONSTRAINT "FK_UserChurchAccess_Churches_ChurchId" FOREIGN KEY ("ChurchId") REFERENCES "Churches" ("Id") ON DELETE RESTRICT)
            """, ct);
        await db.Database.ExecuteSqlRawAsync("""CREATE INDEX IF NOT EXISTS "IX_UserChurchAccess_ChurchId" ON "UserChurchAccess" ("ChurchId")""", ct);

        // The church a session works in, remembered by its refresh token.
        await AddColumnAsync(db, "RefreshTokens", "ChurchId", "TEXT NULL", ct);

        // The history of each church (added with the History area). The pilot churches get theirs where nothing is written yet.
        await AddColumnAsync(db, "Churches", "History", "TEXT NULL", ct);
        foreach (var c in ChurchSeedData.Churches())
            if (c.History is { } text)
                await db.Database.ExecuteSqlInterpolatedAsync($"""UPDATE "Churches" SET "History" = {text} WHERE "Id" = {c.Id} AND "History" IS NULL""", ct);
    }

    internal static async Task AddColumnAsync(AppDbContext db, string table, string column, string definition, CancellationToken ct)
    {
        var exists = await db.Database.SqlQueryRaw<int>($"""SELECT COUNT(*) AS "Value" FROM pragma_table_info('{table}') WHERE name = '{column}'""").SingleAsync(ct);
        if (exists == 0) await db.Database.ExecuteSqlRawAsync($"""ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}""", ct);
    }
}
