using Npgsql;

namespace ChurchSeeker.UnitTests;

/// <summary>
/// A throw-away PostgreSQL database for one test factory. Active only when CHURCHSEEKER_TEST_PG is set, e.g.
/// "Host=localhost;Port=5433;Username=churchseeker;Password=churchseeker_dev"; otherwise tests use SQLite.
/// </summary>
public sealed class PgTestDb : IDisposable
{
    public static string? Server => Environment.GetEnvironmentVariable("CHURCHSEEKER_TEST_PG");

    private readonly string _name = "cs_test_" + Guid.NewGuid().ToString("N");

    public string Connection => $"{Server};Database={_name}";

    public PgTestDb()
    {
        using var c = new NpgsqlConnection($"{Server};Database=postgres");
        c.Open();
        using var cmd = c.CreateCommand();
        cmd.CommandText = $"CREATE DATABASE \"{_name}\"";
        cmd.ExecuteNonQuery();
    }

    public void Dispose()
    {
        NpgsqlConnection.ClearAllPools();
        try
        {
            using var c = new NpgsqlConnection($"{Server};Database=postgres");
            c.Open();
            using var cmd = c.CreateCommand();
            cmd.CommandText = $"DROP DATABASE IF EXISTS \"{_name}\" WITH (FORCE)";
            cmd.ExecuteNonQuery();
        }
        catch { /* best effort */ }
    }
}
