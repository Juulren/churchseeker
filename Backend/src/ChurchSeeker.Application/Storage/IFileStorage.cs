namespace ChurchSeeker.Application.Storage;

public enum FileKind { Logo, Book }

public interface IFileStorage
{
    // Stores the bytes under a server-generated name (GUID + extension) and returns that name.
    // The database provider only stages the row in the current unit of work: the caller's next SaveChanges commits it together
    // with the record that points at it, so a failed save never leaves an orphan. The local provider writes the file at once.
    Task<string> SaveAsync(FileKind kind, byte[] content, string extension, CancellationToken ct = default);
    // Returns null when the name is malformed or the file does not exist (no path is ever built from user input).
    Task<Stream?> OpenReadAsync(FileKind kind, string storedName, CancellationToken ct = default);
    // Stages (database) or performs (local) the removal of a file that nothing points at any more. Unknown names are ignored.
    Task DeleteAsync(FileKind kind, string storedName, CancellationToken ct = default);
}
