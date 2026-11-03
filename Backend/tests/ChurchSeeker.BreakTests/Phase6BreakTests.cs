using System.Net.Http.Json;
using System.Text;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChurchSeeker.BreakTests;

// Phase 6 break tests: defects that only showed on PostgreSQL (page overflow, NUL characters) must never become a 500.
public class Phase6BreakTests : IClassFixture<BreakFactory>
{
    private readonly BreakFactory _f;

    public Phase6BreakTests(BreakFactory f) => _f = f;

    [Theory]
    [InlineData("/api/members")]
    [InlineData("/api/events")]
    [InlineData("/api/donations")]
    [InlineData("/api/announcements")]
    public async Task HugePageNumbers_NeverCauseAServerError(string url)
    {
        var c = await _f.UserClient(UserRole.Administrador, ChurchSeedData.CathedralId, "page" + Math.Abs(url.GetHashCode()));
        foreach (var page in new[] { "2147483647", "-2147483648", "9223372036854775807", "99999999999" })
            ((int)(await c.GetAsync($"{url}?page={page}&pageSize=2147483647")).StatusCode).Should().BeLessThan(500, page);
    }

    [Theory]
    [InlineData("\\u0000")]
    [InlineData("ana\\u0000maria")]
    [InlineData("\\u0001\\u0002")]
    public async Task ControlCharacters_AreRejectedInNames_NotStored(string escaped)
    {
        var c = await _f.UserClient(UserRole.Administrador, ChurchSeedData.CathedralId, "nul" + Math.Abs(escaped.GetHashCode()));
        var body = new StringContent("{\"fullName\":\"" + escaped + "\",\"joinDate\":\"2024-01-01\"}", Encoding.UTF8, "application/json");
        ((int)(await c.PostAsync("/api/members", body)).StatusCode).Should().BeInRange(400, 499);
    }

    [Fact]
    public async Task NulInSearch_IsNotAServerError()
    {
        var c = await _f.UserClient(UserRole.Administrador, ChurchSeedData.CathedralId, "search");
        ((int)(await c.GetAsync("/api/members?search=ab%00cd")).StatusCode).Should().BeInRange(200, 499);
    }

    [Fact]
    public async Task StaffEndpoints_SurviveHostileInput()
    {
        var c = await _f.UserClient(UserRole.Administrador, ChurchSeedData.CathedralId, "staff");
        foreach (var path in new[] { "/api/staff?includeInactive=maybe", "/api/staff?includeInactive=", "/api/staff/not-a-guid/role" })
            ((int)(await c.GetAsync(path)).StatusCode).Should().BeLessThan(500, path);
    }
}
