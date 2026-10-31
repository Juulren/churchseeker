using ChurchSeeker.Application.Common;
using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Events;

public record EventRequest(string Title, string? Description, DateOnly Date, TimeOnly Time, string Location,
                           EventKind Kind, bool IsPublic, Guid? ResponsibleMemberId);

public record EventResponse(Guid Id, string Title, string? Description, DateOnly Date, TimeOnly Time, string Location,
                            EventKind Kind, bool IsPublic, Guid? ResponsibleMemberId, bool IsCancelled);

// What the anonymous calendar may show: no responsible member, no visibility flag.
public record PublicEventResponse(Guid Id, string Title, string? Description, DateOnly Date, TimeOnly Time,
                                  string Location, EventKind Kind, bool IsCancelled);

public record EventQuery(DateOnly? From = null, DateOnly? To = null, int Page = 1, int PageSize = 50);

public interface IEventService
{
    Task<Result<PagedResult<EventResponse>>> ListAsync(EventQuery query, CancellationToken ct = default);
    Task<Result<EventResponse>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<EventResponse>> CreateAsync(EventRequest request, CancellationToken ct = default);
    Task<Result<EventResponse>> UpdateAsync(Guid id, EventRequest request, CancellationToken ct = default);
    Task<Result<EventResponse>> SetCancelledAsync(Guid id, bool cancelled, CancellationToken ct = default);
}

public interface IPublicEventService
{
    Task<Result<IReadOnlyList<PublicEventResponse>>> ListAsync(Guid churchId, DateOnly? from, DateOnly? to, CancellationToken ct = default);
}
