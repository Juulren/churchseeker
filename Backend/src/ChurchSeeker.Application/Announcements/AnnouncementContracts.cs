using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Events;

namespace ChurchSeeker.Application.Announcements;

public record AnnouncementRequest(string Title, string Body, DateOnly PublishDate, DateOnly? ExpiresOn, bool IsImportant, bool IsPublic);

public record AnnouncementResponse(Guid Id, string Title, string Body, DateOnly PublishDate, DateOnly? ExpiresOn,
                                   bool IsImportant, bool IsPublic, bool IsActive);

public record PublicAnnouncementResponse(Guid Id, string Title, string Body, DateOnly PublishDate, DateOnly? ExpiresOn, bool IsImportant);

public record PublicHighlights(IReadOnlyList<PublicAnnouncementResponse> ImportantAnnouncements,
                               IReadOnlyList<PublicEventResponse> UpcomingEvents);

public interface IAnnouncementService
{
    Task<Result<PagedResult<AnnouncementResponse>>> ListAsync(bool includeInactive, int page, int pageSize, CancellationToken ct = default);
    Task<Result<AnnouncementResponse>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<AnnouncementResponse>> CreateAsync(AnnouncementRequest request, CancellationToken ct = default);
    Task<Result<AnnouncementResponse>> UpdateAsync(Guid id, AnnouncementRequest request, CancellationToken ct = default);
    Task<Result<AnnouncementResponse>> DeleteAsync(Guid id, CancellationToken ct = default);
}

public interface IPublicAnnouncementService
{
    Task<Result<IReadOnlyList<PublicAnnouncementResponse>>> ListAsync(Guid churchId, bool importantOnly, CancellationToken ct = default);
    Task<Result<PublicHighlights>> HighlightsAsync(Guid churchId, CancellationToken ct = default);
}
