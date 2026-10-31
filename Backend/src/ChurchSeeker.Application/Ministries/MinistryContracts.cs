using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Events;

namespace ChurchSeeker.Application.Ministries;

public record MinistryRequest(string Name, string? Description, Guid? CoordinatorUserId);
public record MinistryResponse(Guid Id, string Name, string? Description, Guid? CoordinatorUserId, bool IsActive, int MemberCount);
public record MinistryMemberResponse(Guid MemberId, string FullName);

public interface IMinistryService
{
    Task<Result<IReadOnlyList<MinistryResponse>>> ListAsync(CancellationToken ct = default);
    Task<Result<MinistryResponse>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<MinistryResponse>> CreateAsync(MinistryRequest request, CancellationToken ct = default);
    Task<Result<MinistryResponse>> UpdateAsync(Guid id, MinistryRequest request, CancellationToken ct = default);
    Task<Result<MinistryResponse>> SetActiveAsync(Guid id, bool active, CancellationToken ct = default);
    Task<Result<IReadOnlyList<MinistryMemberResponse>>> MembersAsync(Guid id, CancellationToken ct = default);
    Task<Result<IReadOnlyList<MinistryMemberResponse>>> AddMemberAsync(Guid id, Guid memberId, CancellationToken ct = default);
    Task<Result<IReadOnlyList<MinistryMemberResponse>>> RemoveMemberAsync(Guid id, Guid memberId, CancellationToken ct = default);
    Task<Result<IReadOnlyList<EventResponse>>> EventsAsync(Guid id, DateOnly? from, DateOnly? to, CancellationToken ct = default);
}
