# PyInstaller build recipe for PointCloud Viewer.
#
# Why a .spec file instead of a plain `pyinstaller --onefile ...` command
# (which is what this repo used before): the app now ships a whole folder
# of extra files (webapp/ -- the HTML/CSS/JS viewer) alongside the Python
# code, bundled in via PyInstaller's --add-data option. That option's value
# needs a different separator on Windows (`;`) than on macOS/Linux (`:`),
# which is exactly the kind of thing that's easy to get wrong in a CI
# workflow that builds for both. A .spec file sidesteps the whole problem:
# the `datas` list below is just a plain Python tuple, no separator to get
# wrong, and it produces the exact same result on every platform.
#
# Build with:
#   pyinstaller PointCloudViewer.spec
# (this replaces the old `pyinstaller --onefile --windowed ...` command --
# all of those same options are encoded below instead.)

a = Analysis(
    ['Convert_and_plot.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

# Ships the whole webapp/ folder so pointcloud/resources.py can find it at
# runtime via resource_path("webapp"). Tree() (rather than a plain
# datas=[('webapp', 'webapp')] tuple in Analysis above) is PyInstaller's
# documented way to bundle an entire directory -- a real build showed the
# plain-tuple form silently dropping the folder, so this is the version
# that's actually been confirmed to work.
webapp_files = Tree('webapp', prefix='webapp')

# onefile build: everything (interpreter, libraries, webapp/ assets) packed
# into one executable, same as the old --onefile flag.
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    webapp_files,
    [],
    name='PointCloudViewer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # same as the old --windowed flag: no console window behind the GUI
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# On macOS this wraps the executable above into a proper PointCloudViewer.app
# bundle (a double-clickable folder, which is what release.yml expects to
# zip up). PyInstaller ignores this step on Windows, where `exe` above is
# already the final PointCloudViewer.exe.
app = BUNDLE(
    exe,
    name='PointCloudViewer.app',
    icon=None,
    bundle_identifier=None,
)
