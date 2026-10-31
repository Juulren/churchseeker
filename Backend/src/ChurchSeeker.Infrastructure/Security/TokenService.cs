using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using ChurchSeeker.Application.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ChurchSeeker.Infrastructure.Security;

public interface ITokenService
{
    (string Token, DateTime ExpiresAt) CreateAccessToken(UserInfo user, DateTime utcNow);
    (string Raw, string Hash, DateTime ExpiresAt) CreateRefreshToken(DateTime utcNow);
    string Hash(string rawToken);
}

public sealed class TokenService : ITokenService
{
    private readonly JwtOptions _opt;

    public TokenService(IOptions<JwtOptions> options) => _opt = options.Value;

    public (string Token, DateTime ExpiresAt) CreateAccessToken(UserInfo user, DateTime utcNow)
    {
        var expires = utcNow.AddMinutes(_opt.AccessMinutes);
        var claims = new[]
        {
            new System.Security.Claims.Claim("sub", user.Id.ToString()),
            new System.Security.Claims.Claim("email", user.Email),
            new System.Security.Claims.Claim("role", user.Role.ToString()),
            new System.Security.Claims.Claim("church_id", user.ChurchId.ToString()),
            new System.Security.Claims.Claim("jti", Guid.NewGuid().ToString())
        };
        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opt.Key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(_opt.Issuer, _opt.Audience, claims, utcNow, expires, creds);
        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }

    public (string Raw, string Hash, DateTime ExpiresAt) CreateRefreshToken(DateTime utcNow)
    {
        var raw = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(64));
        return (raw, Hash(raw), utcNow.AddDays(_opt.RefreshDays));
    }

    public string Hash(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}


