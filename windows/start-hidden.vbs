' Starts AdBazaar in the background (no window). Output goes to storage\server.log
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(appDir & "\storage") Then fso.CreateFolder(appDir & "\storage")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = appDir
sh.Run "cmd /c node server.js >> storage\server.log 2>&1", 0, False
