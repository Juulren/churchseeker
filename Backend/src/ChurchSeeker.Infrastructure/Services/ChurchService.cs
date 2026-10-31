using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Churches;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Storage;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Domain.Exceptions;
using ChurchSeeker.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class ChurchService : IChurchService, IPublicChurchService
{
    private readonly IRepository<Church> _churches;
    private readonly IFileStorage _storage;
    private readonly ICurrentUser _current;
    private readonly StorageOptions _opt;

    public ChurchService(IRepository<Church> churches, IFileStorage storage, ICurrentUser current, IOptions<StorageOptions> opt)
    {
        _churches = churches; _storage = storage; _current = current; _opt = opt.Value;
    }

    private bool IsAdmin => _current.Role == UserRole.Administrador;

    public async Task<Result<ChurchProfileResponse>> GetOwnAsync(CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } id) return Result<ChurchProfileResponse>.Fail(ErrorKind.Forbidden);
        var c = await _churches.GetByIdAsync(id, ct);
        return c is null ? Result<ChurchProfileResponse>.Fail(ErrorKind.NotFound) : Result<ChurchProfileResponse>.Ok(ToProfile(c));
    }

    public async Task<Result<ChurchProfileResponse>> UpdateOwnAsync(ChurchProfileRequest r, CancellationToken ct = default)
    {
        if (!IsAdmin || _current.ChurchId is not { } id) return Result<ChurchProfileResponse>.Fail(ErrorKind.Forbidden);
        var c = await _churches.GetByIdAsync(id, ct);
        if (c is null) return Result<ChurchProfileResponse>.Fail(ErrorKind.NotFound);
        try
        {
            c.UpdateProfile(r.Name, r.Denomination, r.PatronSaint, r.Address, r.ContactPhone, r.ContactEmail, r.Latitude, r.Longitude,
                (r.Schedules ?? []).Select(s => new ScheduleSlot(s.Day, s.Time, s.Description)).ToList());
            await _churches.SaveChangesAsync(ct);
            return Result<ChurchProfileResponse>.Ok(ToProfile(c));
        }
        catch (DomainException ex) { return Result<ChurchProfileResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public Task<Result<ChurchProfileResponse>> SetLogoAsync(byte[] content, CancellationToken ct = default) =>
        SetFileAsync(content, _opt.MaxImageBytes, FileValidator.ValidateImage, FileKind.Logo, (c, n) => c.SetLogo(n), ct);

    public Task<Result<ChurchProfileResponse>> SetModelAsync(byte[] content, CancellationToken ct = default) =>
        SetFileAsync(content, _opt.MaxModelBytes, FileValidator.ValidateGlb, FileKind.Model, (c, n) => c.SetModel(n), ct);

    private async Task<Result<ChurchProfileResponse>> SetFileAsync(byte[] content, int max, Func<byte[], FileCheck> validate,
        FileKind kind, Action<Church, string> apply, CancellationToken ct)
    {
        if (!IsAdmin || _current.ChurchId is not { } id) return Result<ChurchProfileResponse>.Fail(ErrorKind.Forbidden);
        if (content.Length == 0 || content.Length > max)
            return Result<ChurchProfileResponse>.Fail(ErrorKind.Validation, $"The file must be between 1 byte and {max / 1024 / 1024} MB.");
        var check = validate(content);
        if (!check.Ok) return Result<ChurchProfileResponse>.Fail(ErrorKind.Validation, check.Error!);

        var c = await _churches.GetByIdAsync(id, ct);
        if (c is null) return Result<ChurchProfileResponse>.Fail(ErrorKind.NotFound);
        apply(c, await _storage.SaveAsync(kind, content, check.Extension, ct));
        await _churches.SaveChangesAsync(ct);
        return Result<ChurchProfileResponse>.Ok(ToProfile(c));
    }

    public async Task<IReadOnlyList<PublicChurchSummary>> ListAsync(CancellationToken ct = default)
    {
        var rows = await _churches.Query().AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.Name).ToListAsync(ct);
        return rows.Select(c => new PublicChurchSummary(c.Id, c.Name, c.Denomination, c.PatronSaint, c.Latitude, c.Longitude, ModelUrl(c), LogoUrl(c))).ToList();
    }

    public async Task<Result<ChurchProfileResponse>> GetAsync(Guid churchId, CancellationToken ct = default)
    {
        var c = await _churches.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == churchId && x.IsActive, ct);
        return c is null ? Result<ChurchProfileResponse>.Fail(ErrorKind.NotFound) : Result<ChurchProfileResponse>.Ok(ToProfile(c));
    }

    public Task<Result<FileContent>> OpenLogoAsync(Guid churchId, CancellationToken ct = default) =>
        OpenAsync(churchId, FileKind.Logo, c => c.LogoFile, ct);

    public Task<Result<FileContent>> OpenModelAsync(Guid churchId, CancellationToken ct = default) =>
        OpenAsync(churchId, FileKind.Model, c => c.ModelFile, ct);

    private async Task<Result<FileContent>> OpenAsync(Guid churchId, FileKind kind, Func<Church, string?> pick, CancellationToken ct)
    {
        var c = await _churches.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == churchId && x.IsActive, ct);
        var name = c is null ? null : pick(c);
        var stream = name is null ? null : _storage.OpenRead(kind, name);
        return stream is null ? Result<FileContent>.Fail(ErrorKind.NotFound) : Result<FileContent>.Ok(new FileContent(stream, ContentTypeOf(name!)));
    }

    internal static string ContentTypeOf(string storedName) => Path.GetExtension(storedName).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".jpg" => "image/jpeg",
        ".webp" => "image/webp",
        ".glb" => "model/gltf-binary",
        ".pdf" => "application/pdf",
        _ => "application/octet-stream"
    };

    private static string? ModelUrl(Church c) => c.ModelFile is not null ? $"/api/public/churches/{c.Id}/model" : c.ModelPath;
    private static string? LogoUrl(Church c) => c.LogoFile is not null ? $"/api/public/churches/{c.Id}/logo" : null;

    private static ChurchProfileResponse ToProfile(Church c) => new(c.Id, c.Name, c.Denomination, c.PatronSaint, c.Address,
        c.ContactPhone, c.ContactEmail, c.Latitude, c.Longitude, ModelUrl(c), LogoUrl(c),
        c.Schedules.Select(s => new ScheduleSlotDto(s.Day, s.Time, s.Description)).ToList());
}
