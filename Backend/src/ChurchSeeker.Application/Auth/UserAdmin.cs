using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Auth;

public record ManagedUser(Guid Id, string Email, string FullName, UserRole Role, bool IsActive, bool IsSelf);
public record ChangeRoleRequest(UserRole Role);

// Administrator-only management of the staff of one church.
public interface IUserAdminService
{
    Task<AuthResult<IReadOnlyList<ManagedUser>>> ListAsync(bool includeInactive, CancellationToken ct = default);
    Task<AuthResult<ManagedUser>> SetRoleAsync(Guid id, UserRole role, CancellationToken ct = default);
    Task<AuthResult<ManagedUser>> SetActiveAsync(Guid id, bool active, CancellationToken ct = default);
    Task<AuthResult<bool>> SendPasswordResetAsync(Guid id, CancellationToken ct = default);
}
