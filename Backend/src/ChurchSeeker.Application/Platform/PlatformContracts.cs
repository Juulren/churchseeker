using ChurchSeeker.Application.Auth;
using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Platform;

/// <summary>One church on the general dashboard: the same figures as its own dashboard, plus how many administrators it has.</summary>
public record ChurchOverview(Guid Id, string Name, bool IsActive, int ActiveMembers, int UpcomingEvents, int AttendancesThisMonth,
                             int ActiveMinistries, int Administrators, decimal IncomeThisMonth, decimal IncomeThisYear);

public record PlatformOverview(IReadOnlyList<ChurchOverview> Churches, int TotalMembers, int TotalUpcomingEvents,
                               int TotalAttendancesThisMonth, int TotalMinistries, decimal TotalIncomeThisMonth, decimal TotalIncomeThisYear);

/// <summary>A staff account with every church it works in. Churches[0] is not special: HomeChurchId says where it was created.</summary>
public record PlatformStaff(Guid Id, string Email, string FullName, UserRole Role, bool IsActive, Guid HomeChurchId, IReadOnlyList<ChurchRef> Churches);

public record SetChurchesRequest(IReadOnlyList<Guid> ChurchIds);

/// <summary>Creates an account in a church chosen by the platform. ChurchIds lists the churches it works in; the first is its home.</summary>
public record CreatePlatformStaffRequest(string Email, string FullName, string Password, UserRole Role, IReadOnlyList<Guid> ChurchIds);

/// <summary>Only the platform account (SuperAdministrador) may call these.</summary>
public interface IPlatformService
{
    Task<AuthResult<PlatformOverview>> OverviewAsync(CancellationToken ct = default);
    Task<AuthResult<IReadOnlyList<PlatformStaff>>> ListStaffAsync(CancellationToken ct = default);
    Task<AuthResult<PlatformStaff>> SetChurchesAsync(Guid userId, IReadOnlyList<Guid> churchIds, CancellationToken ct = default);
    Task<AuthResult<PlatformStaff>> CreateStaffAsync(CreatePlatformStaffRequest request, CancellationToken ct = default);
}
