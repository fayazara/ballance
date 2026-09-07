#include <LibCmo/CK2/CKContext.hpp>
#include <LibCmo/CK2/CKFile.hpp>
#include <LibCmo/CK2/CKStateChunk.hpp>
#include <LibCmo/CK2/CKGlobals.hpp>
#include <cstdio>
#include <vector>
int main(int argc,char** argv){if(argc<2)return 1;LibCmo::CK2::CKStartUp();{
LibCmo::CK2::CKContext ctx;ctx.SetEncoding({u8"windows-1252"});LibCmo::CK2::CKFileReader reader(&ctx);
if(reader.ShallowLoad(reinterpret_cast<const char8_t*>(argv[1]))!=LibCmo::CK2::CKERROR::CKERR_OK)return 2;
int i=0;for(auto& o:reader.GetFileObjects()){printf("%d\t%u\t%u\t%s\t",i++,o.ObjectId,(unsigned)o.ObjectCid,reinterpret_cast<const char*>(o.Name.c_str()));if(o.Data){std::vector<unsigned char>b(o.Data->ConvertToBuffer(nullptr));o.Data->ConvertToBuffer(b.data());for(auto v:b)printf("%02x",v);}puts("");}
}LibCmo::CK2::CKShutdown();}
