using System.Net;
using System.Text.Json;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Persistence;
using FluentAssertions;

namespace ChurchSeeker.UnitTests;

public class UserListTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _f;

    public UserListTests(AuthApiFactory f) => _f = f;

    private async Task<HttpClient> As(UserRole role, Guid church, string tag)
    {
        var email = $"{role}-{tag}@users.local".ToLower();
        await TestUsers.Create(_f, email, role, church);
        return await TestUsers.ClientFor(_f, email);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    [Fact]
    public async Task Management_ListsOnlyUsersOfItsOwnChurch_AndCanFilterByRole()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.CathedralId, "list");
        await As(UserRole.Coordinador, ChurchSeedData.CathedralId, "own");
        await As(UserRole.Coordinador, ChurchSeedData.JesusId, "other");

        var all = await Json(await sec.GetAsync("/api/auth/users"));
        all.EnumerateArray().Should().OnlyContain(u => u.GetProperty("churchId").GetGuid() == ChurchSeedData.CathedralId);
        all.EnumerateArray().Select(u => u.GetProperty("email").GetString()).Should().Contain("coordinador-own@users.local").And.NotContain("coordinador-other@users.local");

        var coordinators = await Json(await sec.GetAsync("/api/auth/users?role=5"));
        coordinators.GetArrayLength().Should().Be(1);
        coordinators[0].GetProperty("email").GetString().Should().Be("coordinador-own@users.local");
    }

    [Fact]
    public async Task Response_NeverContainsSecrets()
    {
        var sec = await As(UserRole.Pastor, ChurchSeedData.SantaLuciaId, "secrets");
        var text = await (await sec.GetAsync("/api/auth/users")).Content.ReadAsStringAsync();
        text.Should().NotContainEquivalentOf("hash").And.NotContainEquivalentOf("stamp").And.NotContainEquivalentOf("password");
    }

    [Theory]
    [InlineData(UserRole.Tesorero)]
    [InlineData(UserRole.Coordinador)]
    public async Task OtherRoles_AreForbidden_AndAnonymousIs401(UserRole role)
    {
        var c = await As(role, ChurchSeedData.CathedralId, "deny");
        (await c.GetAsync("/api/auth/users")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _f.CreateClient().GetAsync("/api/auth/users")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task HostileRoleFilter_Is4xx_NeverServerError()
    {
        var sec = await As(UserRole.Secretario, ChurchSeedData.JesusId, "hostile");
        foreach (var q in new[] { "role=99", "role=abc", "role=-1", "role=%00", "role=1;DROP" })
            ((int)(await sec.GetAsync("/api/auth/users?" + q)).StatusCode).Should().BeLessThan(500, q);
    }
}
