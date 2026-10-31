using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// Only the SHA-256 hash of the token is stored. The raw value lives in the client cookie.
public class RefreshToken : BaseEntity
{
    public Guid UserId { get; private set; }
    public string TokenHash { get; private set; } = string.Empty;
    public DateTime ExpiresAt { get; private set; }
    public DateTime? RevokedAt { get; private set; }
    public string? ReplacedByHash { get; private set; }

    private RefreshToken() { }

    public RefreshToken(Guid userId, string tokenHash, DateTime expiresAt)
    {
        if (userId == Guid.Empty) throw new DomainException("UserId is required.");
        if (string.IsNullOrWhiteSpace(tokenHash)) throw new DomainException("TokenHash is required.");
        UserId = userId;
        TokenHash = tokenHash;
        ExpiresAt = expiresAt;
    }

    public bool IsActiveAt(DateTime utcNow) => RevokedAt is null && utcNow < ExpiresAt;

    public void Revoke(DateTime utcNow, string? replacedByHash = null)
    {
        if (RevokedAt is not null) return;
        RevokedAt = utcNow;
        ReplacedByHash = replacedByHash;
        Touch();
    }
}
