using ChurchSeeker.Application.Common;
using ChurchSeeker.Domain.Entities;

namespace ChurchSeeker.Application.Churches;

public record ScheduleSlotDto(DayOfWeek Day, TimeOnly Time, string Description);

public record ChurchProfileRequest(string Name, string Denomination, string PatronSaint, string Address,
                                   string? ContactPhone, string? ContactEmail, double Latitude, double Longitude,
                                   IReadOnlyList<ScheduleSlotDto> Schedules);

public record ChurchProfileResponse(Guid Id, string Name, string Denomination, string PatronSaint, string Address,
                                    string? ContactPhone, string? ContactEmail, double Latitude, double Longitude,
                                    string? ModelUrl, string? LogoUrl, IReadOnlyList<ScheduleSlotDto> Schedules);

public record PublicChurchSummary(Guid Id, string Name, string Denomination, string PatronSaint,
                                  double Latitude, double Longitude, string? ModelUrl, string? LogoUrl);

public record FileContent(Stream Stream, string ContentType);

public interface IChurchService
{
    Task<Result<ChurchProfileResponse>> GetOwnAsync(CancellationToken ct = default);
    Task<Result<ChurchProfileResponse>> UpdateOwnAsync(ChurchProfileRequest request, CancellationToken ct = default);
    Task<Result<ChurchProfileResponse>> SetLogoAsync(byte[] content, CancellationToken ct = default);
    Task<Result<ChurchProfileResponse>> SetModelAsync(byte[] content, CancellationToken ct = default);
}

public interface IPublicChurchService
{
    Task<IReadOnlyList<PublicChurchSummary>> ListAsync(CancellationToken ct = default);
    Task<Result<ChurchProfileResponse>> GetAsync(Guid churchId, CancellationToken ct = default);
    Task<Result<FileContent>> OpenLogoAsync(Guid churchId, CancellationToken ct = default);
    Task<Result<FileContent>> OpenModelAsync(Guid churchId, CancellationToken ct = default);
}
