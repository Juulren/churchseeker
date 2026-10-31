using ChurchSeeker.Application.Books;
using ChurchSeeker.Application.Churches;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Infrastructure.Storage;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace ChurchSeeker.WebAPI.Controllers;

public class BookUploadForm
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Author { get; set; }
    public bool IsPublic { get; set; }
    public string SpineColor { get; set; } = "#5b3a29";
    public int SpineThickness { get; set; } = 5;
    public IFormFile? File { get; set; }
}

// Codex shelf for staff. Private books are readable by any signed-in staff of the same church.
[Route("api/books")]
[Authorize]
public class BooksController : ApiControllerBase
{
    private readonly IBookService _books;
    private readonly StorageOptions _opt;

    public BooksController(IBookService books, IOptions<StorageOptions> opt)
    {
        _books = books;
        _opt = opt.Value;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool includeInactive = false, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50, CancellationToken ct = default) =>
        Map(await _books.ListAsync(includeInactive, page, pageSize, ct));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Map(await _books.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.Management)]
    [RequestSizeLimit(27 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 27 * 1024 * 1024)]
    public async Task<IActionResult> Upload([FromForm] BookUploadForm form, CancellationToken ct)
    {
        var bytes = await UploadReader.ReadCappedAsync(form.File, _opt.MaxPdfBytes, ct);
        if (bytes is null) return BadRequest(new { errors = new[] { "Missing, empty or oversized file." } });
        var meta = new BookMetadata(form.Title, form.Description, form.Author, form.IsPublic, form.SpineColor, form.SpineThickness);
        return Map(await _books.CreateAsync(meta, bytes, ct), b => CreatedAtAction(nameof(Get), new { id = b.Id }, b));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Update(Guid id, BookMetadata metadata, CancellationToken ct) =>
        Map(await _books.UpdateAsync(id, metadata, ct));

    // Deactivates the book (soft delete). The stored file is kept.
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = Policies.Management)]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken ct) =>
        Map(await _books.DeactivateAsync(id, ct), _ => NoContent());

    [HttpGet("{id:guid}/file")]
    public async Task<IActionResult> File(Guid id, CancellationToken ct)
    {
        var r = await _books.OpenFileAsync(id, ct);
        return r.Succeeded ? base.File(r.Value!.Stream, r.Value.ContentType) : NotFound();
    }
}

[Route("api/public/churches/{churchId:guid}/books")]
[AllowAnonymous]
[EnableRateLimiting(RateLimitPolicies.Public)]
public class PublicBooksController : ApiControllerBase
{
    private readonly IPublicBookService _books;

    public PublicBooksController(IPublicBookService books) => _books = books;

    [HttpGet]
    public async Task<IActionResult> List(Guid churchId, CancellationToken ct) => Map(await _books.ListAsync(churchId, ct));

    [HttpGet("{bookId:guid}/file")]
    public async Task<IActionResult> File(Guid churchId, Guid bookId, CancellationToken ct)
    {
        var r = await _books.OpenFileAsync(churchId, bookId, ct);
        return r.Succeeded ? base.File(r.Value!.Stream, r.Value.ContentType) : NotFound();
    }
}
