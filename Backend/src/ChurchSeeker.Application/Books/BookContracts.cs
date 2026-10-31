using ChurchSeeker.Application.Churches;
using ChurchSeeker.Application.Common;

namespace ChurchSeeker.Application.Books;

public record BookMetadata(string Title, string? Description, string? Author, bool IsPublic, string SpineColor, int SpineThickness);

public record BookResponse(Guid Id, string Title, string? Description, string? Author, bool IsPublic,
                           string SpineColor, int SpineThickness, long SizeBytes, bool IsActive);

// Public shelf entries expose no storage names and no visibility flag.
public record PublicBookResponse(Guid Id, string Title, string? Description, string? Author, string SpineColor, int SpineThickness);

public interface IBookService
{
    Task<Result<PagedResult<BookResponse>>> ListAsync(bool includeInactive, int page, int pageSize, CancellationToken ct = default);
    Task<Result<BookResponse>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<BookResponse>> CreateAsync(BookMetadata metadata, byte[] pdf, CancellationToken ct = default);
    Task<Result<BookResponse>> UpdateAsync(Guid id, BookMetadata metadata, CancellationToken ct = default);
    Task<Result<BookResponse>> DeactivateAsync(Guid id, CancellationToken ct = default);
    Task<Result<FileContent>> OpenFileAsync(Guid id, CancellationToken ct = default);
}

public interface IPublicBookService
{
    Task<Result<IReadOnlyList<PublicBookResponse>>> ListAsync(Guid churchId, CancellationToken ct = default);
    // Private, inactive or unknown books are all just "not found": nothing confirms they exist.
    Task<Result<FileContent>> OpenFileAsync(Guid churchId, Guid bookId, CancellationToken ct = default);
}
