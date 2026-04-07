docker run -d \
  --name samba \
  -p 139:139 -p 445:445 \
  -v /tmp/smbshare1:/share1 \
  -v /tmp/smbshare2:/share2 \
  dperson/samba \
  -u "testuser;123456" \
  -s "share1;/share1;yes;no;no;testuser" \
  -s "share2;/share2;yes;no;no;testuser"