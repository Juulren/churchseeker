using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Books;
using ChurchSeeker.Application.Churches;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Storage;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Exceptions;
using ChurchSeeker.Infrastructure.Persistence;
using ChurchSeeker.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class BookService : IBookService, IPublicBookService
{
    private readonly IRepository<ChurchArchiveBook> _books;
    private readonly IRepository<Church> _churches;
    private readonly IFileStorage _storage;
    private readonly ICurrentUser _current;
    private readonly PublicTenantScope _publicScope;
    private readonly StorageOptions _opt;

    public BookService(IRepository<ChurchArchiveBook> books, IRepository<Church> churches, IFileStorage storage,
                       ICurrentUser current, PublicTenantScope publicScope, IOptions<StorageOptions> opt)
    {
        _books = books; _churches = churches; _storage = storage; _current = current; _publicScope = publicScope; _opt = opt.Value;
    }

    public async Task<Result<PagedResult<BookResponse>>> ListAsync(bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = _books.Query().AsNoTracking();
        if (!includeInactive) query = query.Where(b => b.IsActive);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(b => b.Title).ThenBy(b => b.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return Result<PagedResult<BookResponse>>.Ok(new PagedResult<BookResponse>(rows.Select(ToResponse).ToList(), page, pageSize, total));
    }

    public async Task<Result<BookResponse>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var b = await _books.GetByIdAsync(id, ct);
        return b is null ? Result<BookResponse>.Fail(ErrorKind.NotFound) : Result<BookResponse>.Ok(ToResponse(b));
    }

    public async Task<Result<BookResponse>> CreateAsync(BookMetadata m, byte[] pdf, CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } churchId) return Result<BookResponse>.Fail(ErrorKind.Forbidden);
        if (pdf.Length == 0 || pdf.Length > _opt.MaxPdfBytes)
            return Result<BookResponse>.Fail(ErrorKind.Validation, $"The PDF must be between 1 byte and {_opt.MaxPdfBytes / 1024 / 1024} MB.");
        var check = FileValidator.ValidatePdf(pdf);
        if (!check.Ok) return Result<BookResponse>.Fail(ErrorKind.Validation, check.Error!);

        try
        {
            // Validate the metadata first so a bad request never leaves an orphan file on disk.
            _ = new ChurchArchiveBook(churchId, m.Title, m.Description, m.Author, m.IsPublic, m.SpineColor, m.SpineThickness, "pending.pdf", pdf.Length);
            var stored = await _storage.SaveAsync(FileKind.Book, pdf, check.Extension, ct);
            var book = new ChurchArchiveBook(churchId, m.Title, m.Description, m.Author, m.IsPublic, m.SpineColor, m.SpineThickness, stored, pdf.Length);
            await _books.AddAsync(book, ct);
            await _books.SaveChangesAsync(ct);
            return Result<BookResponse>.Ok(ToResponse(book));
        }
        catch (DomainException ex) { return Result<BookResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<BookResponse>> UpdateAsync(Guid id, BookMetadata m, CancellationToken ct = default)
    {
        var b = await _books.GetByIdAsync(id, ct);
        if (b is null) return Result<BookResponse>.Fail(ErrorKind.NotFound);
        try
        {
            b.Update(m.Title, m.Description, m.Author, m.IsPublic, m.SpineColor, m.SpineThickness);
            await _books.SaveChangesAsync(ct);
            return Result<BookResponse>.Ok(ToResponse(b));
        }
        catch (DomainException ex) { return Result<BookResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<BookResponse>> DeactivateAsync(Guid id, CancellationToken ct = default)
    {
        var b = await _books.GetByIdAsync(id, ct);
        if (b is null) return Result<BookResponse>.Fail(ErrorKind.NotFound);
        if (b.IsActive) { b.Deactivate(); await _books.SaveChangesAsync(ct); }
        return Result<BookResponse>.Ok(ToResponse(b));
    }

    // Staff of the owning church (any role) may read private books too; the tenant filter limits it to their church.
    public async Task<Result<FileContent>> OpenFileAsync(Guid id, CancellationToken ct = default)
    {
        var b = await _books.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsActive, ct);
        return Open(b);
    }

    public async Task<Result<IReadOnlyList<PublicBookResponse>>> ListAsync(Guid churchId, CancellationToken ct = default)
    {
        if (!await UsePublicScopeAsync(churchId, ct)) return Result<IReadOnlyList<PublicBookResponse>>.Fail(ErrorKind.NotFound);
        var rows = await _books.Query().AsNoTracking().Where(b => b.IsActive && b.IsPublic)
            .OrderBy(b => b.Title).ThenBy(b => b.Id).Take(200).ToListAsync(ct);
        return Result<IReadOnlyList<PublicBookResponse>>.Ok(
            rows.Select(b => new PublicBookResponse(b.Id, b.Title, b.Description, b.Author, b.SpineColor, b.SpineThickness)).ToList());
    }

    public async Task<Result<FileContent>> OpenFileAsync(Guid churchId, Guid bookId, CancellationToken ct = default)
    {
        if (!await UsePublicScopeAsync(churchId, ct)) return Result<FileContent>.Fail(ErrorKind.NotFound);
        var b = await _books.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == bookId && x.IsActive && x.IsPublic, ct);
        return Open(b);
    }

    private Result<FileContent> Open(ChurchArchiveBook? b)
    {
        var stream = b is null ? null : _storage.OpenRead(FileKind.Book, b.StoredFileName);
        return stream is null ? Result<FileContent>.Fail(ErrorKind.NotFound) : Result<FileContent>.Ok(new FileContent(stream, "application/pdf"));
    }

    private async Task<bool> UsePublicScopeAsync(Guid churchId, CancellationToken ct)
    {
        if (!await _churches.Query().AsNoTracking().AnyAsync(c => c.Id == churchId && c.IsActive, ct)) return false;
        _publicScope.Use(churchId);
        return true;
    }

    private static BookResponse ToResponse(ChurchArchiveBook b) =>
        new(b.Id, b.Title, b.Description, b.Author, b.IsPublic, b.SpineColor, b.SpineThickness, b.SizeBytes, b.IsActive);
}
