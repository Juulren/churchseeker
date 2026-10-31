using ChurchSeeker.Application.Common;

namespace ChurchSeeker.Application.Members;

public record MemberRequest(string FullName, string? Phone, string? Email, DateOnly JoinDate);

public record MemberResponse(Guid Id, string FullName, string? Phone, string? Email, DateOnly JoinDate, bool IsActive);

public record MemberQuery(string? Search = null, bool? Active = null, int Page = 1, int PageSize = 20);

public interface IMemberService
{
    Task<Result<PagedResult<MemberResponse>>> ListAsync(MemberQuery query, CancellationToken ct = default);
    Task<Result<MemberResponse>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<MemberResponse>> CreateAsync(MemberRequest request, CancellationToken ct = default);
    Task<Result<MemberResponse>> UpdateAsync(Guid id, MemberRequest request, CancellationToken ct = default);
    // Soft delete only: there is no physical delete anywhere in the API.
    Task<Result<MemberResponse>> SetActiveAsync(Guid id, bool active, CancellationToken ct = default);
}
