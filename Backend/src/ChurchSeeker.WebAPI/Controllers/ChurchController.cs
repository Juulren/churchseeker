using ChurchSeeker.Application.Churches;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Infrastructure.Storage;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace ChurchSeeker.WebAPI.Controllers;

public static class UploadReader
{
    // Reads at most max+1 bytes so an oversized upload is detected without buffering all of it.
    public static async Task<byte[]?> ReadCappedAsync(IFormFile? file, int max, CancellationToken ct)
    {
        if (file is null || file.Length == 0 || file.Length > max) return null;
        using var ms = new MemoryStream((int)file.Length);
        await using var input = file.OpenReadStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await input.ReadAsync(buffer, ct)) > 0)
        {
            if (ms.Length + read > max) return null;
            ms.Write(buffer, 0, read);
        }
        return ms.ToArray();
    }
}

// Church settings of the caller's own church. Only the Administrador may change them.
[Route("api/church")]
[Authorize]
public class ChurchController : ApiControllerBase
{
    private readonly IChurchService _church;
    private readonly StorageOptions _opt;

    public ChurchController(IChurchService church, IOptions<StorageOptions> opt)
    {
        _church = church;
        _opt = opt.Value;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct) => Map(await _church.GetOwnAsync(ct));

    [HttpPut]
    [Authorize(Policy = Policies.AdminOnly)]
    public async Task<IActionResult> Update(ChurchProfileRequest request, CancellationToken ct) =>
        Map(await _church.UpdateOwnAsync(request, ct));

    [HttpPost("logo")]
    [Authorize(Policy = Policies.AdminOnly)]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public async Task<IActionResult> UploadLogo(IFormFile file, CancellationToken ct)
    {
        var bytes = await UploadReader.ReadCappedAsync(file, _opt.MaxImageBytes, ct);
        return bytes is null ? BadRequest(new { errors = new[] { "Missing, empty or oversized file." } }) : Map(await _church.SetLogoAsync(bytes, ct));
    }

    [HttpPost("model")]
    [Authorize(Policy = Policies.AdminOnly)]
    [RequestSizeLimit(24 * 1024 * 1024)]
    public async Task<IActionResult> UploadModel(IFormFile file, CancellationToken ct)
    {
        var bytes = await UploadReader.ReadCappedAsync(file, _opt.MaxModelBytes, ct);
        return bytes is null ? BadRequest(new { errors = new[] { "Missing, empty or oversized file." } }) : Map(await _church.SetModelAsync(bytes, ct));
    }
}

[Route("api/public/churches")]
[AllowAnonymous]
[EnableRateLimiting(RateLimitPolicies.Public)]
public class PublicChurchesController : ApiControllerBase
{
    private readonly IPublicChurchService _churches;

    public PublicChurchesController(IPublicChurchService churches) => _churches = churches;

    // Everything the interactive map needs to place the churches.
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct) => Ok(await _churches.ListAsync(ct));

    [HttpGet("{churchId:guid}")]
    public async Task<IActionResult> Get(Guid churchId, CancellationToken ct) => Map(await _churches.GetAsync(churchId, ct));

    [HttpGet("{churchId:guid}/logo")]
    public async Task<IActionResult> Logo(Guid churchId, CancellationToken ct) => FileOrNotFound(await _churches.OpenLogoAsync(churchId, ct));

    [HttpGet("{churchId:guid}/model")]
    public async Task<IActionResult> Model(Guid churchId, CancellationToken ct) => FileOrNotFound(await _churches.OpenModelAsync(churchId, ct));

    private IActionResult FileOrNotFound(Result<FileContent> r) => r.Succeeded ? File(r.Value!.Stream, r.Value.ContentType) : NotFound();
}
