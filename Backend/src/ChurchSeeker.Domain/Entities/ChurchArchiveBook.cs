using System.Text.RegularExpressions;
using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// A scanned codex or document on the church shelf ("Acervo / Códices Parroquiales").
public partial class ChurchArchiveBook : TenantEntity, IAuditedEntity
{
    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex ColorPattern();

    public string Title { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public string? Author { get; private set; }
    public bool IsPublic { get; private set; }
    // Visual style of the thick spine on the 3D shelf.
    public string SpineColor { get; private set; } = "#5b3a29";
    public int SpineThickness { get; private set; } = 5;
    // Server-generated GUID name; the original file name is never stored or used on disk.
    public string StoredFileName { get; private set; } = string.Empty;
    public long SizeBytes { get; private set; }

    private ChurchArchiveBook() { }

    public ChurchArchiveBook(Guid churchId, string title, string? description, string? author, bool isPublic,
                             string spineColor, int spineThickness, string storedFileName, long sizeBytes) : base(churchId)
    {
        if (string.IsNullOrWhiteSpace(storedFileName)) throw new DomainException("StoredFileName is required.");
        if (sizeBytes <= 0) throw new DomainException("SizeBytes is invalid.");
        StoredFileName = storedFileName;
        SizeBytes = sizeBytes;
        Apply(title, description, author, isPublic, spineColor, spineThickness);
    }

    public void Update(string title, string? description, string? author, bool isPublic, string spineColor, int spineThickness) =>
        Apply(title, description, author, isPublic, spineColor, spineThickness);

    private void Apply(string title, string? description, string? author, bool isPublic, string spineColor, int spineThickness)
    {
        var t = RequirePlainText(title, nameof(Title), 200);
        var d = OptionalPlainText(description, nameof(Description), 2000);
        var a = OptionalPlainText(author, nameof(Author), 150);
        if (!ColorPattern().IsMatch(spineColor ?? "")) throw new DomainException("SpineColor must look like #RRGGBB.");
        if (spineThickness is < 1 or > 10) throw new DomainException("SpineThickness must be between 1 and 10.");
        Title = t; Description = d; Author = a; IsPublic = isPublic; SpineColor = spineColor!; SpineThickness = spineThickness;
        Touch();
    }
}
