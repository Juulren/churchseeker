using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.UnitTests;

public class SqliteUpgradeTests
{
    [Fact]
    public async Task AnOlderDevelopmentDatabase_GainsTheAccessTableAndTheRefreshChurch_AndTheUpgradeIsRepeatable()
    {
        var file = Path.Combine(Path.GetTempPath(), $"cs-upgrade-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={file}").Options;
            await using (var db = new AppDbContext(options))
            {
                await db.Database.EnsureCreatedAsync();
                // Make it look like a database from before the change.
                await db.Database.ExecuteSqlRawAsync("""DROP TABLE "UserChurchAccess" """);
                await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "RefreshTokens" DROP COLUMN "ChurchId" """);
                await SqliteUpgrades.ApplyAsync(db);
                await SqliteUpgrades.ApplyAsync(db); // repeating changes nothing and does not fail
                (await db.Database.SqlQueryRaw<int>("""SELECT COUNT(*) AS "Value" FROM "UserChurchAccess" """).SingleAsync()).Should().Be(0);
                (await db.Database.SqlQueryRaw<int>("""SELECT COUNT(*) AS "Value" FROM pragma_table_info('RefreshTokens') WHERE name = 'ChurchId'""").SingleAsync()).Should().Be(1);
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try { File.Delete(file); } catch { /* best effort */ }
        }
    }
}
