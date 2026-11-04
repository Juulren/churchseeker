using System.Text.RegularExpressions;
using ChurchSeeker.Application.Storage;
using Microsoft.Extensions.Options;

namespace ChurchSeeker.Infrastructure.Storage;

public sealed partial class LocalFileStorage : IFileStorage
{
    // Only names this class generated can be read back: 32 hex chars plus a known extension.
    [GeneratedRegex(@"^[0-9a-f]{32}\.(pdf|png|jpg|webp)$")]
    private static partial Regex StoredNamePattern();

    private static readonly HashSet<string> AllowedExtensions = ["pdf", "png", "jpg", "webp"];
    private readonly string _root;

    public LocalFileStorage(IOptions<StorageOptions> options)
    {
        _root = Path.GetFullPath(options.Value.Root);
    }

    public async Task<string> SaveAsync(FileKind kind, byte[] content, string extension, CancellationToken ct = default)
    {
        var ext = extension.TrimStart('.').ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext)) throw new ArgumentException("Extension not allowed.", nameof(extension));
        var dir = DirectoryFor(kind);
        Directory.CreateDirectory(dir);
        var name = $"{Guid.NewGuid():N}.{ext}";
        await File.WriteAllBytesAsync(Path.Combine(dir, name), content, ct);
        return name;
    }

    public Stream? OpenRead(FileKind kind, string storedName)
    {
        if (string.IsNullOrEmpty(storedName) || !StoredNamePattern().IsMatch(storedName)) return null;
        var path = Path.Combine(DirectoryFor(kind), storedName);
        return File.Exists(path) ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read) : null;
    }

    private string DirectoryFor(FileKind kind) => Path.Combine(_root, kind.ToString().ToLowerInvariant());
}
