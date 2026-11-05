using ChurchSeeker.Application.Storage;

namespace ChurchSeeker.Infrastructure.Storage;

/// <summary>A file kept in the database (PDFs of the archive, church logos). Stored names are random and never reused.</summary>
public sealed class StoredFile
{
    private StoredFile() { }
    public StoredFile(string name, FileKind kind, byte[] content)
    {
        Name = name;
        Kind = kind;
        Content = content;
        CreatedAt = DateTime.UtcNow;
    }

    public string Name { get; private set; } = null!;
    public FileKind Kind { get; private set; }
    public byte[] Content { get; private set; } = null!;
    public DateTime CreatedAt { get; private set; }
}
