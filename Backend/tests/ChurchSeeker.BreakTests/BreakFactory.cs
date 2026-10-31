using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using ChurchSeeker.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.Tokens;

namespace ChurchSeeker.BreakTests;

public class BreakFactory : WebApplicationFactory<Program>
{
    public const string JwtKey = "break-key-break-key-break-key-break-1234";
    public const string AdminEmail = "admin@break.local";
    public const string AdminPassword = "Adm1n!Passw0rd#";
    public string StorageRoot { get; } = Path.Combine(Path.GetTempPath(), $"cs-store-{Guid.NewGuid():N}");
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"cs-break-{Guid.NewGuid():N}.db");

    protected virtual int AuthLimit => 100000;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Jwt:Key", JwtKey);
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbFile}");
        builder.UseSetting("Database:AutoCreate", "true");
        // Development settings enable demo content; tests need an empty database.
        builder.UseSetting("Seed:Demo", "false");
        builder.UseSetting("Storage:Root", StorageRoot);
        builder.UseSetting("RateLimiting:Auth", AuthLimit.ToString());
        builder.UseSetting("RateLimiting:Global", "100000");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Seed:AdminChurchId", ChurchSeedData.CathedralId.ToString());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* best effort */ }
        try { if (Directory.Exists(StorageRoot)) Directory.Delete(StorageRoot, true); } catch { /* best effort */ }
    }

    public HttpClient Anonymous() => CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    public HttpClient WithBearer(string token)
    {
        var c = Anonymous();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return c;
    }

    public const string UserPassword = "B7eak!Passw0rd#x";

    public async Task<HttpClient> UserClient(UserRole role, Guid churchId, string tag)
    {
        var email = $"{role}-{tag}@brk.local".ToLower();
        using (var scope = Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { Id = Guid.NewGuid(), UserName = email, Email = email, FullName = email, ChurchId = churchId };
            var created = await users.CreateAsync(user, UserPassword);
            if (!created.Succeeded) throw new InvalidOperationException(string.Join(";", created.Errors.Select(e => e.Description)));
            await users.AddToRoleAsync(user, role.ToString());
        }
        return WithBearer(await AccessToken(await Login(Anonymous(), email, UserPassword)));
    }

    public static async Task<JsonElement> ReadJson(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    public static async Task<HttpResponseMessage> Login(HttpClient c, string email, string password) =>
        await c.PostAsJsonAsync("/api/auth/login", new { email, password });

    public static async Task<string> AccessToken(HttpResponseMessage login)
    {
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("accessToken").GetString()!;
    }

    public async Task<string> AdminToken() =>
        await AccessToken(await Login(Anonymous(), AdminEmail, AdminPassword));

    public static string? RefreshCookie(HttpResponseMessage r) =>
        r.Headers.TryGetValues("Set-Cookie", out var v) ? v.FirstOrDefault(c => c.StartsWith("cs_refresh=")) : null;

    public static string CookieValue(string setCookie) => setCookie.Split(';')[0]["cs_refresh=".Length..];

    // Mint a token signed with a chosen key, so tests can attack validation rules one at a time.
    public static string Mint(string role = "Administrador", string? churchId = null, string? key = null,
                              string issuer = "churchseeker", string audience = "churchseeker-clients",
                              DateTime? notBefore = null, DateTime? expires = null, bool includeSub = true)
    {
        var claims = new List<Claim> { new("role", role), new("church_id", churchId ?? ChurchSeedData.CathedralId.ToString()) };
        if (includeSub) claims.Add(new Claim("sub", Guid.NewGuid().ToString()));
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key ?? JwtKey)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(issuer, audience, claims,
            notBefore ?? DateTime.UtcNow.AddMinutes(-1), expires ?? DateTime.UtcNow.AddMinutes(10), creds);
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }
}


